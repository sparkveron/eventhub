import bookings.models
from django.db import migrations, models
from django.utils import timezone


def expire_existing_pending_bookings(apps, schema_editor):
    Booking = apps.get_model('bookings', 'Booking')
    BookingItem = apps.get_model('bookings', 'BookingItem')

    reservation_delta = timezone.timedelta(minutes=bookings.models.BOOKING_RESERVATION_MINUTES)

    for booking in Booking.objects.all().order_by('id'):
        expires_at = booking.created_at + reservation_delta if booking.created_at else timezone.now()

        if booking.status == 'pending':
            items = BookingItem.objects.filter(booking_id=booking.id).select_related('ticket_type')
            for item in items:
                ticket_type = item.ticket_type
                ticket_type.sold = max(0, ticket_type.sold - item.quantity)
                ticket_type.save(update_fields=['sold', 'updated_at'])

            booking.status = 'expired'

        booking.expires_at = expires_at
        booking.save(update_fields=['status', 'expires_at', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('confirmed', 'Confirmed'),
                    ('cancelled', 'Cancelled'),
                    ('expired', 'Expired'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='booking',
            name='expires_at',
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(expire_existing_pending_bookings, noop_reverse),
        migrations.AlterField(
            model_name='booking',
            name='expires_at',
            field=models.DateTimeField(default=bookings.models.default_booking_expiration),
        ),
    ]
