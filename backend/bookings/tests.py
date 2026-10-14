import hashlib
import hmac
import inspect
import json
from io import StringIO
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Profile
from events.models import Category, Event, TicketType

from .models import Booking, BookingItem, Payment
from .serializers import BookingCreateSerializer
from .payments import amount_to_subunit
from .services import cancel_booking, expire_booking, release_booking_inventory


User = get_user_model()


class BookingAPITestCase(APITestCase):
    def setUp(self):
        self.attendee = User.objects.create_user(
            username='attendee',
            email='attendee@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=self.attendee, user_type=Profile.UserType.ATTENDEE)
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='otheruser@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=self.other_user, user_type=Profile.UserType.ATTENDEE)
        self.organizer = User.objects.create_user(
            username='organizer',
            email='organizer@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=self.organizer, user_type=Profile.UserType.ORGANIZER)
        self.other_organizer = User.objects.create_user(
            username='otherorganizer',
            email='otherorganizer@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=self.other_organizer, user_type=Profile.UserType.ORGANIZER)
        self.category = Category.objects.create(name='Music', slug='music')
        self.start = timezone.now() + timedelta(days=7)
        self.end = self.start + timedelta(hours=2)
        self.event = self.create_event(title='Bookable Event', status=Event.Status.PUBLISHED)
        self.other_event = self.create_event(title='Other Event', status=Event.Status.PUBLISHED, days_offset=2)
        self.regular_ticket = TicketType.objects.create(
            event=self.event,
            name='Regular',
            price=Decimal('20.00'),
            quantity=5,
            sold=0,
        )
        self.vip_ticket = TicketType.objects.create(
            event=self.event,
            name='VIP',
            price=Decimal('50.00'),
            quantity=2,
            sold=0,
        )
        self.other_event_ticket = TicketType.objects.create(
            event=self.other_event,
            name='Other',
            price=Decimal('10.00'),
            quantity=3,
            sold=0,
        )

    def create_event(self, title, status, days_offset=0, organizer=None):
        start = self.start + timedelta(days=days_offset)
        return Event.objects.create(
            organizer=organizer or self.organizer,
            category=self.category,
            title=title,
            description='Booking test event.',
            venue='Main Hall',
            address='1 Booking Road',
            city='Reykjavik',
            start_datetime=start,
            end_datetime=start + timedelta(hours=2),
            status=status,
        )

    def create_booking(self, user=None):
        user = user or self.attendee
        booking = Booking.objects.create(user=user, total_amount=Decimal('40.00'))
        BookingItem.objects.create(
            booking=booking,
            ticket_type=self.regular_ticket,
            quantity=2,
            unit_price=self.regular_ticket.price,
            subtotal=Decimal('40.00'),
        )
        self.regular_ticket.sold = 2
        self.regular_ticket.save(update_fields=['sold', 'updated_at'])
        return booking


class BookingCreationTests(BookingAPITestCase):
    def test_authenticated_user_can_create_booking_with_server_calculated_amounts(self):
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(
            '/api/bookings/',
            {
                'user': self.other_user.id,
                'total_amount': '1.00',
                'items': [
                    {
                        'ticket_type': self.regular_ticket.id,
                        'quantity': 2,
                        'unit_price': '1.00',
                        'subtotal': '2.00',
                    },
                    {'ticket_type': self.vip_ticket.id, 'quantity': 1},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(booking_reference=response.data['booking_reference'])
        self.assertEqual(booking.user, self.attendee)
        self.assertTrue(booking.booking_reference)
        self.assertEqual(booking.total_amount, Decimal('90.00'))
        self.assertEqual(booking.items.count(), 2)
        regular_item = booking.items.get(ticket_type=self.regular_ticket)
        self.assertEqual(regular_item.quantity, 2)
        self.assertEqual(regular_item.unit_price, Decimal('20.00'))
        self.assertEqual(regular_item.subtotal, Decimal('40.00'))
        self.regular_ticket.refresh_from_db()
        self.vip_ticket.refresh_from_db()
        self.assertEqual(self.regular_ticket.sold, 2)
        self.assertEqual(self.vip_ticket.sold, 1)

    def test_new_booking_has_ten_minute_expiration_deadline(self):
        self.client.force_authenticate(user=self.attendee)
        before_request = timezone.now()

        response = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': self.regular_ticket.id, 'quantity': 1}]},
            format='json',
        )

        after_request = timezone.now()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(booking_reference=response.data['booking_reference'])
        self.assertGreaterEqual(booking.expires_at, before_request + timedelta(minutes=10))
        self.assertLessEqual(booking.expires_at, after_request + timedelta(minutes=10))
        self.assertEqual(parse_datetime(response.data['expires_at']), booking.expires_at)

    def test_unauthenticated_user_cannot_create_booking(self):
        response = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': self.regular_ticket.id, 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_zero_and_negative_quantities_are_rejected(self):
        self.client.force_authenticate(user=self.attendee)

        zero = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': self.regular_ticket.id, 'quantity': 0}]},
            format='json',
        )
        negative = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': self.regular_ticket.id, 'quantity': -1}]},
            format='json',
        )

        self.assertEqual(zero.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(negative.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nonexistent_ticket_type_is_rejected(self):
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': 999999, 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ticket_types_from_different_events_cannot_be_combined(self):
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(
            '/api/bookings/',
            {
                'items': [
                    {'ticket_type': self.regular_ticket.id, 'quantity': 1},
                    {'ticket_type': self.other_event_ticket.id, 'quantity': 1},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unpublished_cancelled_and_completed_events_cannot_be_booked(self):
        self.client.force_authenticate(user=self.attendee)
        for event_status in [Event.Status.DRAFT, Event.Status.CANCELLED, Event.Status.COMPLETED]:
            event = self.create_event(title=f'{event_status} Event', status=event_status)
            ticket = TicketType.objects.create(
                event=event,
                name=f'{event_status} Ticket',
                price=Decimal('10.00'),
                quantity=1,
            )

            response = self.client.post(
                '/api/bookings/',
                {'items': [{'ticket_type': ticket.id, 'quantity': 1}]},
                format='json',
            )

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_booking_more_than_available_is_rejected_without_partial_changes(self):
        self.client.force_authenticate(user=self.attendee)
        before_sold = self.vip_ticket.sold
        before_count = Booking.objects.count()

        response = self.client.post(
            '/api/bookings/',
            {'items': [{'ticket_type': self.vip_ticket.id, 'quantity': 3}]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.vip_ticket.refresh_from_db()
        self.assertEqual(self.vip_ticket.sold, before_sold)
        self.assertEqual(Booking.objects.count(), before_count)


class BookingAccessTests(BookingAPITestCase):
    def test_user_can_list_and_retrieve_own_booking(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.attendee)

        list_response = self.client.get('/api/bookings/')
        detail_response = self.client.get(f'/api/bookings/{booking.booking_reference}/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data['results'][0]['booking_reference'], booking.booking_reference)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data['event']['id'], self.event.id)
        self.assertIn('expires_at', list_response.data['results'][0])
        self.assertIn('expires_at', detail_response.data)
        self.assertIn('image', detail_response.data['event'])
        self.assertEqual(detail_response.data['event']['address'], self.event.address)
        self.assertEqual(detail_response.data['items'][0]['ticket_type_id'], self.regular_ticket.id)

    def test_user_can_list_and_retrieve_own_expired_booking(self):
        booking = self.create_booking()
        booking.status = Booking.Status.EXPIRED
        booking.save(update_fields=['status', 'updated_at'])
        self.client.force_authenticate(user=self.attendee)

        list_response = self.client.get('/api/bookings/')
        detail_response = self.client.get(f'/api/bookings/{booking.booking_reference}/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data['results'][0]['status'], Booking.Status.EXPIRED)
        self.assertEqual(detail_response.data['status'], Booking.Status.EXPIRED)

    def test_user_cannot_retrieve_or_cancel_another_users_booking(self):
        booking = self.create_booking(user=self.other_user)
        self.client.force_authenticate(user=self.attendee)

        retrieve_response = self.client.get(f'/api/bookings/{booking.booking_reference}/')
        cancel_response = self.client.post(f'/api/bookings/{booking.booking_reference}/cancel/')

        self.assertEqual(retrieve_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(cancel_response.status_code, status.HTTP_404_NOT_FOUND)


class OrganizerBookingManagementTests(BookingAPITestCase):
    def create_organizer_booking(
        self,
        ticket=None,
        subtotal=Decimal('40.00'),
        status_value=Booking.Status.CONFIRMED,
        created_at=None,
        user=None,
    ):
        ticket = ticket or self.regular_ticket
        booking = Booking.objects.create(
            user=user or self.attendee,
            total_amount=subtotal,
            status=status_value,
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=ticket,
            quantity=2,
            unit_price=subtotal / 2,
            subtotal=subtotal,
        )
        if created_at:
            Booking.objects.filter(id=booking.id).update(created_at=created_at)
            booking.refresh_from_db()
        return booking

    def create_other_organizer_ticket(self):
        other_event = self.create_event(
            title='Other Organizer Event',
            status=Event.Status.PUBLISHED,
            organizer=self.other_organizer,
            days_offset=3,
        )
        return TicketType.objects.create(
            event=other_event,
            name='Other Organizer Ticket',
            price=Decimal('75.00'),
            quantity=5,
            sold=0,
        )

    def test_organizer_can_list_bookings_for_own_events(self):
        booking = self.create_organizer_booking()
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/bookings/organizer/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['booking_reference'], booking.booking_reference)
        self.assertEqual(response.data['results'][0]['events'][0]['id'], self.event.id)
        self.assertNotIn('user', response.data['results'][0])

    def test_unauthenticated_and_attendee_access_are_rejected(self):
        unauthenticated = self.client.get('/api/bookings/organizer/')

        self.client.force_authenticate(user=self.attendee)
        attendee = self.client.get('/api/bookings/organizer/')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(attendee.status_code, status.HTTP_403_FORBIDDEN)

    def test_organizer_cannot_see_other_organizer_only_bookings(self):
        other_ticket = self.create_other_organizer_ticket()
        other_booking = self.create_organizer_booking(
            ticket=other_ticket,
            subtotal=Decimal('75.00'),
        )
        self.client.force_authenticate(user=self.organizer)

        list_response = self.client.get('/api/bookings/organizer/')
        detail_response = self.client.get(
            f'/api/bookings/organizer/{other_booking.booking_reference}/',
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data['count'], 0)
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mixed_organizer_booking_exposes_only_current_organizer_items_and_value(self):
        other_ticket = self.create_other_organizer_ticket()
        booking = Booking.objects.create(
            user=self.attendee,
            total_amount=Decimal('115.00'),
            status=Booking.Status.CONFIRMED,
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=self.regular_ticket,
            quantity=2,
            unit_price=Decimal('20.00'),
            subtotal=Decimal('40.00'),
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=other_ticket,
            quantity=1,
            unit_price=Decimal('75.00'),
            subtotal=Decimal('75.00'),
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/{booking.booking_reference}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['booking_value'], Decimal('40.00'))
        self.assertEqual(response.data['events'], [{
            'id': self.event.id,
            'title': self.event.title,
            'slug': self.event.slug,
        }])
        self.assertEqual(len(response.data['items']), 1)
        self.assertEqual(response.data['items'][0]['ticket_type_name'], self.regular_ticket.name)
        self.assertNotIn('Other Organizer Event', str(response.data))
        self.assertNotIn('Other Organizer Ticket', str(response.data))

    def test_cancelled_booking_value_is_zero(self):
        booking = self.create_organizer_booking(status_value=Booking.Status.CANCELLED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/{booking.booking_reference}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['booking_value'], Decimal('0.00'))

    def test_expired_booking_value_is_zero(self):
        booking = self.create_organizer_booking(status_value=Booking.Status.EXPIRED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/{booking.booking_reference}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['booking_value'], Decimal('0.00'))

    def test_pagination_works(self):
        for index in range(12):
            self.create_organizer_booking(
                subtotal=Decimal('40.00'),
                created_at=timezone.now() + timedelta(minutes=index),
            )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/bookings/organizer/?page_size=5')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 12)
        self.assertEqual(len(response.data['results']), 5)
        self.assertIn('next', response.data)

    def test_default_ordering_is_newest_first(self):
        older = self.create_organizer_booking(created_at=timezone.now() - timedelta(days=1))
        newer = self.create_organizer_booking(created_at=timezone.now())
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/bookings/organizer/')

        references = [booking['booking_reference'] for booking in response.data['results']]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(references[:2], [newer.booking_reference, older.booking_reference])

    def test_search_by_booking_reference_works(self):
        target = self.create_organizer_booking()
        self.create_organizer_booking()
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/?search={target.booking_reference.lower()}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['booking_reference'], target.booking_reference)

    def test_event_filtering_works_and_does_not_reveal_other_organizer_events(self):
        target = self.create_organizer_booking(ticket=self.vip_ticket, subtotal=Decimal('100.00'))
        self.create_organizer_booking(ticket=self.regular_ticket)
        other_ticket = self.create_other_organizer_ticket()
        self.create_organizer_booking(ticket=other_ticket, subtotal=Decimal('75.00'))
        self.client.force_authenticate(user=self.organizer)

        own_response = self.client.get(f'/api/bookings/organizer/?event={self.event.id}')
        other_response = self.client.get(f'/api/bookings/organizer/?event={other_ticket.event_id}')

        own_references = {booking['booking_reference'] for booking in own_response.data['results']}
        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertIn(target.booking_reference, own_references)
        self.assertEqual(other_response.status_code, status.HTTP_200_OK)
        self.assertEqual(other_response.data['count'], 0)

    def test_status_filtering_works(self):
        confirmed = self.create_organizer_booking(status_value=Booking.Status.CONFIRMED)
        self.create_organizer_booking(status_value=Booking.Status.PENDING)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/?status={Booking.Status.CONFIRMED}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['booking_reference'], confirmed.booking_reference)

    def test_expired_status_filtering_works(self):
        expired = self.create_organizer_booking(status_value=Booking.Status.EXPIRED)
        self.create_organizer_booking(status_value=Booking.Status.PENDING)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/bookings/organizer/?status={Booking.Status.EXPIRED}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['booking_reference'], expired.booking_reference)

    def test_inclusive_date_range_filtering_works(self):
        inside = self.create_organizer_booking(created_at=timezone.now())
        self.create_organizer_booking(created_at=timezone.now() - timedelta(days=3))
        self.client.force_authenticate(user=self.organizer)
        today = timezone.now().date().isoformat()

        response = self.client.get(f'/api/bookings/organizer/?date_from={today}&date_to={today}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['booking_reference'], inside.booking_reference)

    def test_valid_ordering_options_work_and_invalid_values_are_rejected(self):
        pending = self.create_organizer_booking(status_value=Booking.Status.PENDING)
        confirmed = self.create_organizer_booking(status_value=Booking.Status.CONFIRMED)
        self.client.force_authenticate(user=self.organizer)

        created_response = self.client.get('/api/bookings/organizer/?ordering=created_at')
        status_response = self.client.get('/api/bookings/organizer/?ordering=status')
        invalid_response = self.client.get('/api/bookings/organizer/?ordering=booking_reference')

        self.assertEqual(created_response.status_code, status.HTTP_200_OK)
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [booking['booking_reference'] for booking in status_response.data['results']],
            [confirmed.booking_reference, pending.booking_reference],
        )
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_filter_values_are_rejected(self):
        self.client.force_authenticate(user=self.organizer)

        invalid_event = self.client.get('/api/bookings/organizer/?event=abc')
        invalid_status = self.client.get('/api/bookings/organizer/?status=refunded')
        invalid_date = self.client.get('/api/bookings/organizer/?date_from=bad-date')

        self.assertEqual(invalid_event.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_status.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_date.status_code, status.HTTP_400_BAD_REQUEST)

    def test_existing_attendee_endpoints_remain_unaffected(self):
        booking = self.create_organizer_booking()
        self.client.force_authenticate(user=self.attendee)

        list_response = self.client.get('/api/bookings/')
        detail_response = self.client.get(f'/api/bookings/{booking.booking_reference}/')
        cancel_response = self.client.post(f'/api/bookings/{booking.booking_reference}/cancel/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data['results'][0]['booking_reference'], booking.booking_reference)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)


class BookingCancellationTests(BookingAPITestCase):
    def test_user_can_cancel_own_booking_and_restore_availability(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(f'/api/bookings/{booking.booking_reference}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.CANCELLED)
        self.assertEqual(self.regular_ticket.sold, 0)
        self.assertEqual(self.regular_ticket.available_tickets, self.regular_ticket.quantity)

    def test_already_cancelled_booking_cannot_be_cancelled_again(self):
        booking = self.create_booking()
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=['status', 'updated_at'])
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(f'/api/bookings/{booking.booking_reference}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BookingExpirationTests(BookingAPITestCase):
    def make_overdue(self, booking):
        Booking.objects.filter(id=booking.id).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        booking.refresh_from_db()
        return booking

    def test_overdue_pending_booking_expires_and_releases_inventory(self):
        booking = self.make_overdue(self.create_booking())

        expired = expire_booking(booking.id)

        self.assertTrue(expired)
        booking.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.EXPIRED)
        self.assertEqual(self.regular_ticket.sold, 0)
        self.assertEqual(self.regular_ticket.available_tickets, self.regular_ticket.quantity)

    def test_expiration_is_idempotent_and_does_not_release_inventory_twice(self):
        booking = self.make_overdue(self.create_booking())

        first_result = expire_booking(booking.id)
        second_result = expire_booking(booking.id)

        self.assertTrue(first_result)
        self.assertFalse(second_result)
        self.regular_ticket.refresh_from_db()
        self.assertEqual(self.regular_ticket.sold, 0)

    def test_unexpired_pending_confirmed_and_cancelled_bookings_are_not_expired(self):
        unexpired = self.create_booking()
        confirmed = self.make_overdue(self.create_booking())
        confirmed.status = Booking.Status.CONFIRMED
        confirmed.save(update_fields=['status', 'updated_at'])
        cancelled = self.make_overdue(self.create_booking())
        cancelled.status = Booking.Status.CANCELLED
        cancelled.save(update_fields=['status', 'updated_at'])

        self.assertFalse(expire_booking(unexpired.id))
        self.assertFalse(expire_booking(confirmed.id))
        self.assertFalse(expire_booking(cancelled.id))

        unexpired.refresh_from_db()
        confirmed.refresh_from_db()
        cancelled.refresh_from_db()
        self.assertEqual(unexpired.status, Booking.Status.PENDING)
        self.assertEqual(confirmed.status, Booking.Status.CONFIRMED)
        self.assertEqual(cancelled.status, Booking.Status.CANCELLED)

    def test_expired_booking_cannot_be_cancelled_or_release_inventory_again(self):
        booking = self.make_overdue(self.create_booking())
        self.assertTrue(expire_booking(booking.id))
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(f'/api/bookings/{booking.booking_reference}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        booking.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.EXPIRED)
        self.assertEqual(self.regular_ticket.sold, 0)

    def test_cancelled_booking_is_not_expired_after_inventory_is_released(self):
        booking = self.make_overdue(self.create_booking())
        cancelled_booking, result = cancel_booking(booking.booking_reference, self.attendee)

        expired = expire_booking(cancelled_booking.id)

        self.assertEqual(result, 'cancelled')
        self.assertFalse(expired)
        cancelled_booking.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(cancelled_booking.status, Booking.Status.CANCELLED)
        self.assertEqual(self.regular_ticket.sold, 0)

    def test_expire_bookings_management_command(self):
        overdue = self.make_overdue(self.create_booking())
        unexpired = self.create_booking()
        output = StringIO()

        self.regular_ticket.refresh_from_db()
        sold_before_expiration = self.regular_ticket.sold
        available_before_expiration = self.regular_ticket.available_tickets

        call_command('expire_bookings', stdout=output)

        overdue.refresh_from_db()
        unexpired.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(overdue.status, Booking.Status.EXPIRED)
        self.assertEqual(unexpired.status, Booking.Status.PENDING)
        self.assertEqual(self.regular_ticket.sold, sold_before_expiration - 2)
        self.assertEqual(self.regular_ticket.available_tickets, available_before_expiration + 2)
        self.assertIn('Expired 1 booking(s).', output.getvalue())

        second_output = StringIO()
        sold_after_expiration = self.regular_ticket.sold
        available_after_expiration = self.regular_ticket.available_tickets

        call_command('expire_bookings', stdout=second_output)

        overdue.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(overdue.status, Booking.Status.EXPIRED)
        self.assertEqual(self.regular_ticket.sold, sold_after_expiration)
        self.assertEqual(self.regular_ticket.available_tickets, available_after_expiration)
        self.assertIn('Expired 0 booking(s).', second_output.getvalue())

    def test_failed_expiration_rolls_back_status_and_inventory(self):
        booking = self.make_overdue(self.create_booking())

        def release_then_fail(locked_booking):
            TicketType.objects.filter(id=self.regular_ticket.id).update(sold=0)
            raise RuntimeError('Simulated inventory release failure.')

        with patch('bookings.services.release_booking_inventory', side_effect=release_then_fail):
            with self.assertRaises(RuntimeError):
                expire_booking(booking.id)

        booking.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.PENDING)
        self.assertEqual(self.regular_ticket.sold, 2)
        self.assertEqual(self.regular_ticket.available_tickets, 3)


class BookingTransactionSafetyTests(BookingAPITestCase):
    def test_partial_booking_does_not_modify_sold_counts_when_any_item_is_unavailable(self):
        self.client.force_authenticate(user=self.attendee)
        before_regular_sold = self.regular_ticket.sold
        before_vip_sold = self.vip_ticket.sold

        response = self.client.post(
            '/api/bookings/',
            {
                'items': [
                    {'ticket_type': self.regular_ticket.id, 'quantity': 1},
                    {'ticket_type': self.vip_ticket.id, 'quantity': 3},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.regular_ticket.refresh_from_db()
        self.vip_ticket.refresh_from_db()
        self.assertEqual(self.regular_ticket.sold, before_regular_sold)
        self.assertEqual(self.vip_ticket.sold, before_vip_sold)
        self.assertFalse(Booking.objects.exists())

    def test_booking_create_and_cancel_code_uses_transactions_and_row_locks(self):
        create_source = inspect.getsource(BookingCreateSerializer.create)
        cancel_source = inspect.getsource(cancel_booking)
        expire_source = inspect.getsource(expire_booking)
        release_source = inspect.getsource(release_booking_inventory)

        self.assertIn('transaction.atomic()', create_source)
        self.assertIn('select_for_update()', create_source)
        self.assertIn('transaction.atomic()', cancel_source)
        self.assertIn('select_for_update()', cancel_source)
        self.assertIn('transaction.atomic()', expire_source)
        self.assertIn('select_for_update()', expire_source)
        self.assertIn('select_for_update()', release_source)
        self.assertIn("order_by('id')", release_source)


class PaymentTests(BookingAPITestCase):
    secret_key = 'sk_test_eventhub'
    currency = 'GHS'

    class MockPaystackResponse:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self):
            return json.dumps(self.payload).encode('utf-8')

    def paystack_response(self, data):
        return self.MockPaystackResponse({'status': True, 'data': data})

    def create_payment(self, booking=None):
        booking = booking or self.create_booking()
        self.client.force_authenticate(user=self.attendee)
        with override_settings(
            PAYSTACK_SECRET_KEY=self.secret_key,
            PAYSTACK_CURRENCY=self.currency,
            PAYSTACK_CALLBACK_URL='http://localhost:5173/payment/return',
        ):
            def initialize_response(request, timeout):
                payment_reference = json.loads(request.data.decode('utf-8'))['reference']
                return self.paystack_response({
                    'authorization_url': 'https://checkout.paystack.com/example',
                    'reference': payment_reference,
                })

            with patch('bookings.payments.urlopen', side_effect=initialize_response):
                response = self.client.post(
                    f'/api/bookings/{booking.booking_reference}/payment/initialize/',
                )
        return booking, response

    @override_settings(PAYSTACK_SECRET_KEY='', PAYSTACK_CURRENCY='GHS')
    def test_checkout_initialization_fails_without_secret_key(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(
            f'/api/bookings/{booking.booking_reference}/payment/initialize/',
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(Payment.objects.exists())

    @override_settings(
        PAYSTACK_SECRET_KEY=secret_key,
        PAYSTACK_CURRENCY=currency,
        PAYSTACK_CALLBACK_URL='http://localhost:5173/payment/return',
    )
    def test_owner_can_initialize_checkout_from_server_side_amount(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.attendee)
        provider_data = {
            'authorization_url': 'https://checkout.paystack.com/example',
            'reference': 'placeholder',
        }

        def initialize_response(request, timeout):
            self.assertEqual(request.get_header('Accept'), 'application/json')
            self.assertEqual(request.get_header('User-agent'), 'EventHub/1.0')
            payment_reference = json.loads(request.data.decode('utf-8'))['reference']
            provider_data['reference'] = payment_reference
            return self.paystack_response(provider_data)

        with patch('bookings.payments.urlopen', side_effect=initialize_response):
            response = self.client.post(
                f'/api/bookings/{booking.booking_reference}/payment/initialize/',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment = Payment.objects.get(booking=booking)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.amount, booking.total_amount)
        self.assertEqual(payment.currency, self.currency)
        self.assertEqual(response.data['authorization_url'], provider_data['authorization_url'])
        self.assertNotIn('sk_test', json.dumps(response.data))

    @override_settings(
        PAYSTACK_SECRET_KEY=secret_key,
        PAYSTACK_CURRENCY=currency,
    )
    def test_provider_network_failure_returns_safe_error(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.attendee)

        with patch('bookings.payments.urlopen', side_effect=OSError('provider unavailable')):
            response = self.client.post(
                f'/api/bookings/{booking.booking_reference}/payment/initialize/',
            )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data['detail'], 'Paystack could not be reached. Please try again.')
        self.assertNotIn('provider unavailable', json.dumps(response.data))
        self.assertFalse(Payment.objects.filter(booking=booking).exists())

    @override_settings(
        PAYSTACK_SECRET_KEY=secret_key,
        PAYSTACK_CURRENCY=currency,
        PAYSTACK_CALLBACK_URL='http://localhost:5173/payment/return',
    )
    def test_non_owner_cannot_initialize_checkout(self):
        booking = self.create_booking()
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(
            f'/api/bookings/{booking.booking_reference}/payment/initialize/',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_cancelled_expired_and_confirmed_bookings_cannot_be_paid(self):
        for booking_status in [
            Booking.Status.CANCELLED,
            Booking.Status.EXPIRED,
            Booking.Status.CONFIRMED,
        ]:
            booking = self.create_booking()
            booking.status = booking_status
            booking.save(update_fields=['status', 'updated_at'])
            self.client.force_authenticate(user=self.attendee)

            response = self.client.post(
                f'/api/bookings/{booking.booking_reference}/payment/initialize/',
            )

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(
        PAYSTACK_SECRET_KEY=secret_key,
        PAYSTACK_CURRENCY=currency,
        PAYSTACK_CALLBACK_URL='http://localhost:5173/payment/return',
    )
    def test_successful_verification_confirms_booking_once(self):
        booking, initialize_response = self.create_payment()
        self.assertEqual(initialize_response.status_code, status.HTTP_200_OK)
        payment_reference = initialize_response.data['payment_reference']
        provider_data = {
            'id': 123456789,
            'status': 'success',
            'reference': payment_reference,
            'amount': amount_to_subunit(booking.total_amount),
            'currency': self.currency,
            'gateway_response': 'Successful',
        }
        self.client.force_authenticate(user=self.attendee)

        with patch('bookings.payments.urlopen', return_value=self.paystack_response(provider_data)) as verify_mock:
            response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': payment_reference},
                format='json',
            )
            repeated_response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': payment_reference},
                format='json',
            )

        booking.refresh_from_db()
        payment = Payment.objects.get(payment_reference=payment_reference)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated_response.status_code, status.HTTP_200_OK)
        self.assertEqual(booking.status, Booking.Status.CONFIRMED)
        self.assertEqual(payment.status, Payment.Status.SUCCESSFUL)
        self.assertEqual(verify_mock.call_count, 1)
        self.regular_ticket.refresh_from_db()
        self.assertEqual(self.regular_ticket.sold, 2)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_competing_payment_attempt_cannot_confirm_booking_twice(self):
        booking, initialize_response = self.create_payment()
        first_reference = initialize_response.data['payment_reference']
        second_payment = Payment.objects.create(
            booking=booking,
            payment_reference='EHPTSECONDATTEMPT',
            amount=booking.total_amount,
            currency=self.currency,
            status=Payment.Status.PENDING,
        )
        provider_data = {
            'id': 123456794,
            'status': 'success',
            'reference': first_reference,
            'amount': amount_to_subunit(booking.total_amount),
            'currency': self.currency,
        }
        self.client.force_authenticate(user=self.attendee)

        with patch('bookings.payments.urlopen', return_value=self.paystack_response(provider_data)):
            first_response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': first_reference},
                format='json',
            )

        provider_data['id'] = 123456795
        provider_data['reference'] = second_payment.payment_reference
        with patch('bookings.payments.urlopen', return_value=self.paystack_response(provider_data)):
            second_response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': second_payment.payment_reference},
                format='json',
            )

        booking.refresh_from_db()
        second_payment.refresh_from_db()
        self.regular_ticket.refresh_from_db()
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(booking.status, Booking.Status.CONFIRMED)
        self.assertEqual(Payment.objects.filter(booking=booking, status=Payment.Status.SUCCESSFUL).count(), 1)
        self.assertEqual(second_payment.status, Payment.Status.ABANDONED)
        self.assertEqual(self.regular_ticket.sold, 2)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_verification_rejects_amount_and_currency_mismatches(self):
        booking, initialize_response = self.create_payment()
        payment_reference = initialize_response.data['payment_reference']
        self.client.force_authenticate(user=self.attendee)

        mismatched_data = {
            'id': 123456790,
            'status': 'success',
            'reference': payment_reference,
            'amount': amount_to_subunit(booking.total_amount) + 1,
            'currency': 'NGN',
        }
        with patch('bookings.payments.urlopen', return_value=self.paystack_response(mismatched_data)):
            response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': payment_reference},
                format='json',
            )

        payment = Payment.objects.get(payment_reference=payment_reference)
        booking.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(booking.status, Booking.Status.PENDING)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_verification_rejects_provider_reference_mismatch(self):
        booking, initialize_response = self.create_payment()
        payment_reference = initialize_response.data['payment_reference']
        self.client.force_authenticate(user=self.attendee)
        mismatched_data = {
            'id': 123456793,
            'status': 'success',
            'reference': 'different-provider-reference',
            'amount': amount_to_subunit(booking.total_amount),
            'currency': self.currency,
        }

        with patch('bookings.payments.urlopen', return_value=self.paystack_response(mismatched_data)):
            response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': payment_reference},
                format='json',
            )

        payment = Payment.objects.get(payment_reference=payment_reference)
        booking.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(booking.status, Booking.Status.PENDING)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_failed_and_abandoned_provider_transactions_do_not_confirm_booking(self):
        expected_payment_statuses = {
            'failed': Payment.Status.FAILED,
            'abandoned': Payment.Status.ABANDONED,
        }

        for index, (provider_status, expected_payment_status) in enumerate(
            expected_payment_statuses.items(),
            start=1,
        ):
            with self.subTest(provider_status=provider_status):
                booking, initialize_response = self.create_payment()
                payment_reference = initialize_response.data['payment_reference']
                self.regular_ticket.refresh_from_db()
                sold_before_verification = self.regular_ticket.sold
                provider_data = {
                    'id': 123456800 + index,
                    'status': provider_status,
                    'reference': payment_reference,
                    'amount': amount_to_subunit(booking.total_amount),
                    'currency': self.currency,
                }

                with patch(
                    'bookings.payments.urlopen',
                    return_value=self.paystack_response(provider_data),
                ):
                    response = self.client.post(
                        '/api/bookings/payment/verify/',
                        {'reference': payment_reference},
                        format='json',
                    )

                booking.refresh_from_db()
                payment = Payment.objects.get(payment_reference=payment_reference)
                self.regular_ticket.refresh_from_db()
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data['booking']['status'], Booking.Status.PENDING)
                self.assertEqual(booking.status, Booking.Status.PENDING)
                self.assertEqual(payment.status, expected_payment_status)
                self.assertEqual(self.regular_ticket.sold, sold_before_verification)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_late_success_expires_booking_and_does_not_confirm_it(self):
        booking, initialize_response = self.create_payment()
        payment_reference = initialize_response.data['payment_reference']
        Booking.objects.filter(id=booking.id).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.client.force_authenticate(user=self.attendee)
        provider_data = {
            'id': 123456791,
            'status': 'success',
            'reference': payment_reference,
            'amount': amount_to_subunit(booking.total_amount),
            'currency': self.currency,
        }

        with patch('bookings.payments.urlopen', return_value=self.paystack_response(provider_data)):
            response = self.client.post(
                '/api/bookings/payment/verify/',
                {'reference': payment_reference},
                format='json',
            )

        booking.refresh_from_db()
        payment = Payment.objects.get(payment_reference=payment_reference)
        self.regular_ticket.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(booking.status, Booking.Status.EXPIRED)
        self.assertEqual(payment.status, Payment.Status.ABANDONED)
        self.assertTrue(payment.metadata['late_payment'])
        self.assertEqual(self.regular_ticket.sold, 0)

    @override_settings(PAYSTACK_SECRET_KEY=secret_key, PAYSTACK_CURRENCY=currency)
    def test_webhook_requires_signature_and_is_idempotent(self):
        booking, initialize_response = self.create_payment()
        payment_reference = initialize_response.data['payment_reference']
        payload = json.dumps({
            'event': 'charge.success',
            'data': {'reference': payment_reference},
        }).encode('utf-8')
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            payload,
            hashlib.sha512,
        ).hexdigest()
        provider_data = {
            'id': 123456792,
            'status': 'success',
            'reference': payment_reference,
            'amount': amount_to_subunit(booking.total_amount),
            'currency': self.currency,
        }

        invalid = self.client.post(
            '/api/payments/paystack/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_PAYSTACK_SIGNATURE='invalid',
        )
        self.assertEqual(invalid.status_code, status.HTTP_401_UNAUTHORIZED)

        with patch('bookings.payments.urlopen', return_value=self.paystack_response(provider_data)) as verify_mock:
            first = self.client.post(
                '/api/payments/paystack/webhook/',
                data=payload,
                content_type='application/json',
                HTTP_X_PAYSTACK_SIGNATURE=signature,
            )
            second = self.client.post(
                '/api/payments/paystack/webhook/',
                data=payload,
                content_type='application/json',
                HTTP_X_PAYSTACK_SIGNATURE=signature,
            )

        booking.refresh_from_db()
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(booking.status, Booking.Status.CONFIRMED)
        self.assertEqual(verify_mock.call_count, 1)
