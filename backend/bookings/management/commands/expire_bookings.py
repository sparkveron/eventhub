from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking
from bookings.services import expire_booking


class Command(BaseCommand):
    help = 'Expire overdue pending bookings and release their reserved ticket inventory.'

    def handle(self, *args, **options):
        now = timezone.now()
        booking_ids = list(
            Booking.objects
            .filter(status=Booking.Status.PENDING, expires_at__lte=now)
            .order_by('id')
            .values_list('id', flat=True)
        )

        expired_count = 0
        for booking_id in booking_ids:
            if expire_booking(booking_id, now=now):
                expired_count += 1

        self.stdout.write(self.style.SUCCESS(f'Expired {expired_count} booking(s).'))
