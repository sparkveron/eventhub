from django.db import transaction
from django.utils import timezone

from events.models import TicketType

from .models import Booking


def release_booking_inventory(booking):
    items = list(booking.items.select_related('ticket_type').all())
    ticket_type_ids = sorted({item.ticket_type_id for item in items})
    locked_ticket_types = (
        TicketType.objects.select_for_update()
        .filter(id__in=ticket_type_ids)
        .order_by('id')
    )
    ticket_types_by_id = {ticket_type.id: ticket_type for ticket_type in locked_ticket_types}

    for item in items:
        ticket_type = ticket_types_by_id[item.ticket_type_id]
        ticket_type.sold = max(0, ticket_type.sold - item.quantity)
        ticket_type.save(update_fields=['sold', 'updated_at'])


def cancel_booking(booking_reference, user):
    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update()
            .filter(user=user, booking_reference=booking_reference)
            .first()
        )

        if booking is None:
            return None, 'not_found'

        if booking.status == Booking.Status.CANCELLED:
            return booking, 'already_cancelled'

        if booking.status not in [Booking.Status.PENDING, Booking.Status.CONFIRMED]:
            return booking, 'not_cancellable'

        release_booking_inventory(booking)
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=['status', 'updated_at'])

    return booking, 'cancelled'


def expire_booking(booking_id, now=None):
    now = now or timezone.now()

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update()
            .filter(id=booking_id)
            .first()
        )

        if booking is None:
            return False

        if booking.status != Booking.Status.PENDING:
            return False

        if booking.expires_at is None or booking.expires_at > now:
            return False

        release_booking_inventory(booking)
        booking.status = Booking.Status.EXPIRED
        booking.save(update_fields=['status', 'updated_at'])

    return True
