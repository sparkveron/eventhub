from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


BOOKING_RESERVATION_MINUTES = 10


def generate_booking_reference():
    return f'EH{uuid4().hex[:10].upper()}'


def default_booking_expiration():
    return timezone.now() + timezone.timedelta(minutes=BOOKING_RESERVATION_MINUTES)


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        CANCELLED = 'cancelled', 'Cancelled'
        EXPIRED = 'expired', 'Expired'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bookings',
    )
    booking_reference = models.CharField(
        max_length=20,
        unique=True,
        default=generate_booking_reference,
        editable=False,
    )
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    expires_at = models.DateTimeField(default=default_booking_expiration)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.booking_reference


class BookingItem(models.Model):
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='items',
    )
    ticket_type = models.ForeignKey(
        'events.TicketType',
        on_delete=models.PROTECT,
        related_name='booking_items',
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['booking', 'ticket_type'],
                name='unique_ticket_type_per_booking',
            ),
        ]

    def __str__(self):
        return f'{self.quantity} x {self.ticket_type.name}'


class Payment(models.Model):
    class Provider(models.TextChoices):
        PAYSTACK = 'paystack', 'Paystack'

    class Status(models.TextChoices):
        INITIALIZED = 'initialized', 'Initialized'
        PENDING = 'pending', 'Pending'
        SUCCESSFUL = 'successful', 'Successful'
        FAILED = 'failed', 'Failed'
        ABANDONED = 'abandoned', 'Abandoned'

    booking = models.ForeignKey(
        Booking,
        on_delete=models.PROTECT,
        related_name='payments',
    )
    payment_reference = models.CharField(max_length=40, unique=True, editable=False)
    provider = models.CharField(
        max_length=20,
        choices=Provider.choices,
        default=Provider.PAYSTACK,
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    currency = models.CharField(max_length=3)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.INITIALIZED,
    )
    provider_transaction_id = models.PositiveBigIntegerField(
        unique=True,
        null=True,
        blank=True,
    )
    authorization_url = models.URLField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['booking'],
                condition=models.Q(status='successful'),
                name='one_successful_payment_per_booking',
            ),
        ]

    def __str__(self):
        return self.payment_reference
