from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils.text import slugify


def unique_slug_for(instance, value):
    base_slug = slugify(value) or 'item'
    slug = base_slug
    suffix = 1
    model_class = instance.__class__

    queryset = model_class.objects.filter(slug=slug)
    if instance.pk:
        queryset = queryset.exclude(pk=instance.pk)

    while queryset.exists():
        suffix += 1
        slug = f'{base_slug}-{suffix}'
        queryset = model_class.objects.filter(slug=slug)
        if instance.pk:
            queryset = queryset.exclude(pk=instance.pk)

    return slug


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'categories'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug_for(self, self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Event(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'
        CANCELLED = 'cancelled', 'Cancelled'
        COMPLETED = 'completed', 'Completed'

    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='events',
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name='events',
        blank=True,
        null=True,
    )
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField()
    image = models.ImageField(upload_to='events/', blank=True, null=True)
    venue = models.CharField(max_length=200)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_datetime', 'title']
        constraints = [
            models.CheckConstraint(
                condition=Q(end_datetime__gt=F('start_datetime')),
                name='event_end_after_start',
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug_for(self, self.title)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class TicketType(models.Model):
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='ticket_types',
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(0)])
    sold = models.PositiveIntegerField(default=0, validators=[MinValueValidator(0)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['price', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'name'],
                name='unique_ticket_type_per_event',
            ),
            models.CheckConstraint(
                condition=Q(sold__lte=F('quantity')),
                name='ticket_type_sold_not_over_quantity',
            ),
        ]

    @property
    def available_tickets(self):
        return self.quantity - self.sold

    def __str__(self):
        return f'{self.event.title} - {self.name}'
