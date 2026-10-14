from django.conf import settings
from django.db import models


class Profile(models.Model):
    class UserType(models.TextChoices):
        ATTENDEE = 'attendee', 'Attendee'
        ORGANIZER = 'organizer', 'Organizer'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    user_type = models.CharField(
        max_length=20,
        choices=UserType.choices,
        default=UserType.ATTENDEE,
    )
    phone_number = models.CharField(max_length=20, blank=True)
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['user__username']

    def __str__(self):
        return f'{self.user.username} profile'
