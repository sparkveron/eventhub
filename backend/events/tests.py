from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Profile
from bookings.models import Booking, BookingItem

from .models import Category, Event, TicketType


User = get_user_model()


class EventAPITestCase(APITestCase):
    def setUp(self):
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
        self.attendee = User.objects.create_user(
            username='attendee',
            email='attendee@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=self.attendee, user_type=Profile.UserType.ATTENDEE)
        self.category = Category.objects.create(name='Music', slug='music')
        self.start = timezone.now() + timedelta(days=7)
        self.end = self.start + timedelta(hours=2)

    def event_payload(self, **overrides):
        payload = {
            'title': 'Created Event',
            'description': 'Created through the API.',
            'venue': 'Main Hall',
            'address': '123 Main Street',
            'city': 'Reykjavik',
            'start_datetime': self.start.isoformat(),
            'end_datetime': self.end.isoformat(),
            'category': self.category.id,
        }
        payload.update(overrides)
        return payload

    def create_event(self, **overrides):
        data = {
            'organizer': self.organizer,
            'category': self.category,
            'title': 'Published Concert',
            'description': 'A searchable concert description.',
            'venue': 'Concert Hall',
            'address': '1 Event Road',
            'city': 'Reykjavik',
            'start_datetime': self.start,
            'end_datetime': self.end,
            'status': Event.Status.PUBLISHED,
        }
        data.update(overrides)
        return Event.objects.create(**data)


class CategoryAPITests(EventAPITestCase):
    def test_public_user_can_retrieve_categories(self):
        response = self.client.get('/api/events/categories/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Music')
        self.assertEqual(response.data[0]['slug'], 'music')


class PublicEventAPITests(EventAPITestCase):
    def test_public_list_includes_published_and_excludes_draft_and_cancelled_events(self):
        published = self.create_event(title='Published Event')
        self.create_event(title='Draft Event', status=Event.Status.DRAFT)
        self.create_event(title='Cancelled Event', status=Event.Status.CANCELLED)

        response = self.client.get('/api/events/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [event['title'] for event in response.data['results']]
        self.assertIn(published.title, titles)
        self.assertNotIn('Draft Event', titles)
        self.assertNotIn('Cancelled Event', titles)

    def test_event_detail_works_by_id_and_slug(self):
        event = self.create_event()

        by_id = self.client.get(f'/api/events/{event.id}/')
        by_slug = self.client.get(f'/api/events/{event.slug}/')

        self.assertEqual(by_id.status_code, status.HTTP_200_OK)
        self.assertEqual(by_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(by_id.data['id'], event.id)
        self.assertEqual(by_slug.data['slug'], event.slug)

    def test_unpublished_event_is_not_publicly_accessible(self):
        event = self.create_event(status=Event.Status.DRAFT)

        response = self.client.get(f'/api/events/{event.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_search_category_city_filters_and_pagination_work(self):
        self.create_event(title='Jazz Night', city='Reykjavik')
        self.create_event(title='Rock Night', city='Akureyri')

        search_response = self.client.get('/api/events/?search=Jazz')
        category_response = self.client.get('/api/events/?category=music')
        city_response = self.client.get('/api/events/?city=Reykjavik')
        paginated_response = self.client.get('/api/events/?page_size=1')

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data['results'][0]['title'], 'Jazz Night')
        self.assertEqual(category_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(category_response.data['count'], 2)
        self.assertEqual(city_response.status_code, status.HTTP_200_OK)
        self.assertTrue(all(event['city'] == 'Reykjavik' for event in city_response.data['results']))
        self.assertIn('next', paginated_response.data)
        self.assertEqual(len(paginated_response.data['results']), 1)


class OrganizerEventListAPITests(EventAPITestCase):
    def test_organizer_can_access_my_events(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/my/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_organizer_receives_only_own_events(self):
        own_draft = self.create_event(title='Own Draft', status=Event.Status.DRAFT)
        own_published = self.create_event(title='Own Published', status=Event.Status.PUBLISHED)
        self.create_event(
            organizer=self.other_organizer,
            title='Other Organizer Event',
            status=Event.Status.PUBLISHED,
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/my/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event_ids = {event['id'] for event in response.data['results']}
        self.assertEqual(event_ids, {own_draft.id, own_published.id})

    def test_organizer_can_see_events_across_all_statuses(self):
        expected_statuses = {
            Event.Status.DRAFT,
            Event.Status.PUBLISHED,
            Event.Status.CANCELLED,
            Event.Status.COMPLETED,
        }
        for event_status in expected_statuses:
            self.create_event(title=f'{event_status.title()} Event', status=event_status)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/my/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_statuses = {event['status'] for event in response.data['results']}
        self.assertEqual(returned_statuses, expected_statuses)

    def test_another_organizer_cannot_see_first_organizers_events(self):
        event = self.create_event(title='Private Organizer Event', status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.other_organizer)

        response = self.client.get('/api/events/my/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event_ids = {event_data['id'] for event_data in response.data['results']}
        self.assertNotIn(event.id, event_ids)
        self.assertEqual(response.data['count'], 0)

    def test_attendee_and_unauthenticated_users_cannot_access_my_events(self):
        unauthenticated = self.client.get('/api/events/my/')

        self.client.force_authenticate(user=self.attendee)
        attendee = self.client.get('/api/events/my/')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(attendee.status_code, status.HTTP_403_FORBIDDEN)

    def test_my_events_pagination_uses_existing_paginated_response(self):
        for index in range(12):
            self.create_event(title=f'Organizer Event {index}')
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/my/?page_size=5')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 12)
        self.assertIn('next', response.data)
        self.assertEqual(len(response.data['results']), 5)

    def test_my_events_can_filter_by_status(self):
        self.create_event(title='Draft Event', status=Event.Status.DRAFT)
        self.create_event(title='Published Event', status=Event.Status.PUBLISHED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/my/?status={Event.Status.DRAFT}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['status'], Event.Status.DRAFT)

    def test_public_event_list_still_excludes_non_published_events_for_authenticated_organizer(self):
        published = self.create_event(title='Visible Published', status=Event.Status.PUBLISHED)
        self.create_event(title='Hidden Draft', status=Event.Status.DRAFT)
        self.create_event(title='Hidden Completed', status=Event.Status.COMPLETED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event_ids = {event['id'] for event in response.data['results']}
        self.assertEqual(event_ids, {published.id})


class EventAnalyticsAPITests(EventAPITestCase):
    def create_ticket(self, event, **overrides):
        data = {
            'event': event,
            'name': f'{event.title} Ticket',
            'description': 'Analytics ticket',
            'price': Decimal('25.00'),
            'quantity': 10,
            'sold': 0,
        }
        data.update(overrides)
        return TicketType.objects.create(**data)

    def create_booking_item(self, ticket, quantity=1, subtotal=Decimal('25.00'), status_value=Booking.Status.CONFIRMED):
        booking = Booking.objects.create(
            user=self.attendee,
            total_amount=subtotal,
            status=status_value,
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=ticket,
            quantity=quantity,
            unit_price=subtotal / quantity,
            subtotal=subtotal,
        )
        return booking

    def test_organizer_can_retrieve_analytics(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('summary', response.data)
        self.assertIn('upcoming_events', response.data)
        self.assertIn('recent_bookings', response.data)

    def test_unauthenticated_and_attendee_requests_are_rejected(self):
        unauthenticated = self.client.get('/api/events/analytics/')

        self.client.force_authenticate(user=self.attendee)
        attendee = self.client.get('/api/events/analytics/')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(attendee.status_code, status.HTTP_403_FORBIDDEN)

    def test_organizer_analytics_exclude_other_organizer_events_and_bookings(self):
        own_event = self.create_event(title='Own Analytics Event')
        other_event = self.create_event(
            organizer=self.other_organizer,
            title='Other Analytics Event',
        )
        own_ticket = self.create_ticket(own_event, sold=2)
        other_ticket = self.create_ticket(other_event, sold=3)
        self.create_booking_item(own_ticket, quantity=2, subtotal=Decimal('50.00'))
        self.create_booking_item(other_ticket, quantity=3, subtotal=Decimal('75.00'))
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['total_events'], 1)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('50.00'))
        recent_event_titles = {
            event['title']
            for booking in response.data['recent_bookings']
            for event in booking['events']
        }
        self.assertEqual(recent_event_titles, {'Own Analytics Event'})

    def test_event_status_counts_are_correct(self):
        self.create_event(title='Draft', status=Event.Status.DRAFT)
        self.create_event(title='Published', status=Event.Status.PUBLISHED)
        self.create_event(title='Cancelled', status=Event.Status.CANCELLED)
        self.create_event(title='Completed', status=Event.Status.COMPLETED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['total_events'], 4)
        self.assertEqual(summary['draft_events'], 1)
        self.assertEqual(summary['published_events'], 1)
        self.assertEqual(summary['cancelled_events'], 1)
        self.assertEqual(summary['completed_events'], 1)

    def test_ticket_capacity_sold_and_available_totals_are_correct(self):
        event = self.create_event()
        self.create_ticket(event, name='Regular', quantity=10, sold=3)
        self.create_ticket(event, name='VIP', quantity=5, sold=2)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['total_ticket_capacity'], 15)
        self.assertEqual(summary['tickets_sold'], 5)
        self.assertEqual(summary['tickets_available'], 10)

    def test_cancelled_bookings_are_excluded_from_booking_value(self):
        event = self.create_event()
        ticket = self.create_ticket(event, sold=2)
        self.create_booking_item(ticket, quantity=1, subtotal=Decimal('25.00'))
        self.create_booking_item(
            ticket,
            quantity=1,
            subtotal=Decimal('25.00'),
            status_value=Booking.Status.CANCELLED,
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('25.00'))
        self.assertEqual(
            response.data['summary']['booking_value_statuses'],
            [Booking.Status.PENDING, Booking.Status.CONFIRMED],
        )

    def test_expired_bookings_are_excluded_from_booking_value_and_counted(self):
        event = self.create_event()
        ticket = self.create_ticket(event, sold=1)
        included = self.create_booking_item(
            ticket,
            quantity=1,
            subtotal=Decimal('25.00'),
            status_value=Booking.Status.PENDING,
        )
        expired = self.create_booking_item(
            ticket,
            quantity=1,
            subtotal=Decimal('30.00'),
            status_value=Booking.Status.EXPIRED,
        )
        Booking.objects.filter(id=included.id).update(created_at=timezone.now())
        Booking.objects.filter(id=expired.id).update(created_at=timezone.now() + timedelta(minutes=1))
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        recent_booking = response.data['recent_bookings'][0]
        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['booking_value'], Decimal('25.00'))
        self.assertEqual(summary['pending_bookings'], 1)
        self.assertEqual(summary['expired_bookings'], 1)
        self.assertEqual(recent_booking['booking_reference'], expired.booking_reference)
        self.assertEqual(recent_booking['total_amount'], Decimal('0.00'))

    def test_booking_value_uses_recorded_item_subtotals_not_current_ticket_prices(self):
        event = self.create_event()
        ticket = self.create_ticket(event, price=Decimal('20.00'), sold=1)
        self.create_booking_item(ticket, quantity=1, subtotal=Decimal('20.00'))
        ticket.price = Decimal('999.00')
        ticket.save(update_fields=['price', 'updated_at'])
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('20.00'))

    def test_booking_items_from_different_organizers_are_attributed_correctly(self):
        own_event = self.create_event(title='Own Mixed Event')
        other_event = self.create_event(
            organizer=self.other_organizer,
            title='Other Mixed Event',
        )
        own_ticket = self.create_ticket(own_event, name='Own Ticket', sold=1)
        other_ticket = self.create_ticket(other_event, name='Other Ticket', sold=1)
        booking = Booking.objects.create(
            user=self.attendee,
            total_amount=Decimal('125.00'),
            status=Booking.Status.CONFIRMED,
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=own_ticket,
            quantity=1,
            unit_price=Decimal('50.00'),
            subtotal=Decimal('50.00'),
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=other_ticket,
            quantity=1,
            unit_price=Decimal('75.00'),
            subtotal=Decimal('75.00'),
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        recent_booking = response.data['recent_bookings'][0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('50.00'))
        self.assertEqual(recent_booking['total_amount'], Decimal('50.00'))
        self.assertEqual(recent_booking['events'], [{
            'id': own_event.id,
            'title': own_event.title,
            'slug': own_event.slug,
        }])
        self.assertEqual(len(recent_booking['ticket_summary']), 1)
        self.assertEqual(recent_booking['ticket_summary'][0]['ticket_type_name'], 'Own Ticket')

    def test_expired_mixed_organizer_booking_is_scoped_and_has_zero_value(self):
        own_event = self.create_event(title='Own Expired Mixed Event')
        other_event = self.create_event(
            organizer=self.other_organizer,
            title='Other Expired Mixed Event',
        )
        own_ticket = self.create_ticket(own_event, name='Own Expired Ticket')
        other_ticket = self.create_ticket(other_event, name='Other Expired Ticket')
        booking = Booking.objects.create(
            user=self.attendee,
            total_amount=Decimal('125.00'),
            status=Booking.Status.EXPIRED,
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=own_ticket,
            quantity=1,
            unit_price=Decimal('50.00'),
            subtotal=Decimal('50.00'),
        )
        BookingItem.objects.create(
            booking=booking,
            ticket_type=other_ticket,
            quantity=1,
            unit_price=Decimal('75.00'),
            subtotal=Decimal('75.00'),
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        recent_booking = response.data['recent_bookings'][0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('0.00'))
        self.assertEqual(recent_booking['total_amount'], Decimal('0.00'))
        self.assertEqual(recent_booking['events'], [{
            'id': own_event.id,
            'title': own_event.title,
            'slug': own_event.slug,
        }])
        self.assertEqual(len(recent_booking['ticket_summary']), 1)
        self.assertNotIn('Other Expired Mixed Event', str(response.data))
        self.assertNotIn('Other Expired Ticket', str(response.data))

    def test_recent_bookings_are_newest_first_limited_and_scoped(self):
        event = self.create_event(title='Recent Event')
        other_event = self.create_event(
            organizer=self.other_organizer,
            title='Other Recent Event',
        )
        ticket = self.create_ticket(event)
        other_ticket = self.create_ticket(other_event)
        created_bookings = []
        for index in range(6):
            booking = self.create_booking_item(
                ticket,
                quantity=1,
                subtotal=Decimal('25.00'),
            )
            Booking.objects.filter(id=booking.id).update(
                created_at=timezone.now() + timedelta(minutes=index),
            )
            booking.refresh_from_db()
            created_bookings.append(booking)
        other_booking = self.create_booking_item(
            other_ticket,
            quantity=1,
            subtotal=Decimal('25.00'),
        )
        Booking.objects.filter(id=other_booking.id).update(
            created_at=timezone.now() + timedelta(minutes=99),
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        references = [
            booking['booking_reference']
            for booking in response.data['recent_bookings']
        ]
        expected_references = [
            booking.booking_reference
            for booking in sorted(
                created_bookings,
                key=lambda booking: booking.created_at,
                reverse=True,
            )[:5]
        ]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(references, expected_references)
        self.assertNotIn(other_booking.booking_reference, references)

    def test_upcoming_events_use_future_draft_and_published_events(self):
        upcoming_draft = self.create_event(
            title='Upcoming Draft',
            status=Event.Status.DRAFT,
            start_datetime=timezone.now() + timedelta(days=1),
            end_datetime=timezone.now() + timedelta(days=1, hours=2),
        )
        upcoming_published = self.create_event(
            title='Upcoming Published',
            status=Event.Status.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=2),
            end_datetime=timezone.now() + timedelta(days=2, hours=2),
        )
        self.create_event(
            title='Past Published',
            status=Event.Status.PUBLISHED,
            start_datetime=timezone.now() - timedelta(days=1),
            end_datetime=timezone.now() - timedelta(days=1, hours=-2),
        )
        self.create_event(
            title='Upcoming Cancelled',
            status=Event.Status.CANCELLED,
            start_datetime=timezone.now() + timedelta(days=3),
            end_datetime=timezone.now() + timedelta(days=3, hours=2),
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get('/api/events/analytics/')

        upcoming_ids = [event['id'] for event in response.data['upcoming_events']]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(upcoming_ids, [upcoming_draft.id, upcoming_published.id])

    def test_empty_organizer_receives_zero_statistics_and_empty_lists(self):
        empty_organizer = User.objects.create_user(
            username='emptyorganizer',
            email='empty@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=empty_organizer, user_type=Profile.UserType.ORGANIZER)
        self.client.force_authenticate(user=empty_organizer)

        response = self.client.get('/api/events/analytics/')

        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['total_events'], 0)
        self.assertEqual(summary['draft_events'], 0)
        self.assertEqual(summary['published_events'], 0)
        self.assertEqual(summary['cancelled_events'], 0)
        self.assertEqual(summary['completed_events'], 0)
        self.assertEqual(summary['total_ticket_capacity'], 0)
        self.assertEqual(summary['tickets_sold'], 0)
        self.assertEqual(summary['tickets_available'], 0)
        self.assertEqual(summary['booking_value'], Decimal('0.00'))
        self.assertEqual(summary['pending_bookings'], 0)
        self.assertEqual(summary['confirmed_bookings'], 0)
        self.assertEqual(summary['cancelled_bookings'], 0)
        self.assertEqual(summary['expired_bookings'], 0)
        self.assertEqual(response.data['upcoming_events'], [])
        self.assertEqual(response.data['recent_bookings'], [])


class EventPerformanceAPITests(EventAPITestCase):
    def create_ticket(self, event, **overrides):
        data = {
            'event': event,
            'name': f'{event.title} Ticket',
            'description': 'Performance ticket',
            'price': Decimal('25.00'),
            'quantity': 10,
            'sold': 0,
        }
        data.update(overrides)
        return TicketType.objects.create(**data)

    def create_booking(self, items, status_value=Booking.Status.CONFIRMED, minutes_offset=0):
        total_amount = sum(
            (item_data['subtotal'] for item_data in items),
            Decimal('0.00'),
        )
        booking = Booking.objects.create(
            user=self.attendee,
            total_amount=total_amount,
            status=status_value,
        )

        for item_data in items:
            BookingItem.objects.create(
                booking=booking,
                ticket_type=item_data['ticket'],
                quantity=item_data['quantity'],
                unit_price=item_data['unit_price'],
                subtotal=item_data['subtotal'],
            )

        if minutes_offset:
            Booking.objects.filter(id=booking.id).update(
                created_at=timezone.now() + timedelta(minutes=minutes_offset),
            )
            booking.refresh_from_db()

        return booking

    def test_owner_organizer_can_retrieve_event_performance(self):
        event = self.create_event(title='Performance Event')
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['event']['id'], event.id)
        self.assertIn('summary', response.data)
        self.assertIn('ticket_types', response.data)
        self.assertIn('recent_bookings', response.data)

    def test_unauthenticated_attendee_other_organizer_and_missing_event_are_rejected(self):
        event = self.create_event(title='Private Performance Event')

        unauthenticated = self.client.get(f'/api/events/{event.id}/performance/')

        self.client.force_authenticate(user=self.attendee)
        attendee = self.client.get(f'/api/events/{event.id}/performance/')

        self.client.force_authenticate(user=self.other_organizer)
        other_organizer = self.client.get(f'/api/events/{event.id}/performance/')
        missing = self.client.get('/api/events/999999/performance/')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(attendee.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(other_organizer.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_inventory_totals_and_per_ticket_type_figures_are_correct(self):
        event = self.create_event(title='Inventory Event')
        regular = self.create_ticket(event, name='Regular', price=Decimal('20.00'), quantity=20, sold=5)
        vip = self.create_ticket(event, name='VIP', price=Decimal('50.00'), quantity=8, sold=2)
        self.create_booking([
            {
                'ticket': regular,
                'quantity': 2,
                'unit_price': Decimal('20.00'),
                'subtotal': Decimal('40.00'),
            },
            {
                'ticket': vip,
                'quantity': 1,
                'unit_price': Decimal('50.00'),
                'subtotal': Decimal('50.00'),
            },
        ])
        self.create_booking([
            {
                'ticket': regular,
                'quantity': 1,
                'unit_price': Decimal('20.00'),
                'subtotal': Decimal('20.00'),
            },
        ], status_value=Booking.Status.CANCELLED)
        self.create_booking([
            {
                'ticket': regular,
                'quantity': 1,
                'unit_price': Decimal('20.00'),
                'subtotal': Decimal('20.00'),
            },
        ], status_value=Booking.Status.EXPIRED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        summary = response.data['summary']
        ticket_values = {
            ticket['name']: ticket
            for ticket in response.data['ticket_types']
        }
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['ticket_capacity'], 28)
        self.assertEqual(summary['tickets_sold'], 7)
        self.assertEqual(summary['tickets_available'], 21)
        self.assertEqual(summary['booking_value'], Decimal('90.00'))
        self.assertEqual(ticket_values['Regular']['quantity'], 20)
        self.assertEqual(ticket_values['Regular']['sold'], 5)
        self.assertEqual(ticket_values['Regular']['available_tickets'], 15)
        self.assertEqual(ticket_values['Regular']['booking_value'], Decimal('40.00'))
        self.assertEqual(ticket_values['VIP']['booking_value'], Decimal('50.00'))

    def test_booking_counts_are_distinct_and_correct_for_every_status(self):
        event = self.create_event(title='Counts Event')
        regular = self.create_ticket(event, name='Regular')
        vip = self.create_ticket(event, name='VIP')
        self.create_booking([
            {
                'ticket': regular,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
            {
                'ticket': vip,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], status_value=Booking.Status.PENDING)
        self.create_booking([
            {
                'ticket': regular,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], status_value=Booking.Status.CONFIRMED)
        self.create_booking([
            {
                'ticket': vip,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], status_value=Booking.Status.CANCELLED)
        self.create_booking([
            {
                'ticket': vip,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], status_value=Booking.Status.EXPIRED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['total_bookings'], 4)
        self.assertEqual(summary['pending_bookings'], 1)
        self.assertEqual(summary['confirmed_bookings'], 1)
        self.assertEqual(summary['cancelled_bookings'], 1)
        self.assertEqual(summary['expired_bookings'], 1)
        self.assertEqual(summary['booking_value'], Decimal('75.00'))
        self.assertEqual(
            summary['booking_value_statuses'],
            [Booking.Status.PENDING, Booking.Status.CONFIRMED],
        )

    def test_expired_recent_booking_has_zero_event_value(self):
        event = self.create_event(title='Expired Recent Event')
        ticket = self.create_ticket(event)
        expired = self.create_booking([
            {
                'ticket': ticket,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], status_value=Booking.Status.EXPIRED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        summary = response.data['summary']
        recent_booking = response.data['recent_bookings'][0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['booking_value'], Decimal('0.00'))
        self.assertEqual(summary['expired_bookings'], 1)
        self.assertEqual(recent_booking['booking_reference'], expired.booking_reference)
        self.assertEqual(recent_booking['booking_value'], Decimal('0.00'))

    def test_booking_value_uses_recorded_subtotals_after_ticket_price_changes(self):
        event = self.create_event(title='Recorded Value Event')
        ticket = self.create_ticket(event, price=Decimal('30.00'))
        self.create_booking([
            {
                'ticket': ticket,
                'quantity': 2,
                'unit_price': Decimal('30.00'),
                'subtotal': Decimal('60.00'),
            },
        ], status_value=Booking.Status.CONFIRMED)
        ticket.price = Decimal('999.00')
        ticket.save(update_fields=['price', 'updated_at'])
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('60.00'))
        self.assertEqual(response.data['ticket_types'][0]['booking_value'], Decimal('60.00'))

    def test_mixed_event_and_mixed_organizer_data_is_scoped_to_selected_event(self):
        event = self.create_event(title='Selected Event')
        sibling_event = self.create_event(title='Sibling Event')
        other_event = self.create_event(
            organizer=self.other_organizer,
            title='Other Organizer Event',
        )
        selected_ticket = self.create_ticket(event, name='Selected Ticket')
        sibling_ticket = self.create_ticket(sibling_event, name='Sibling Ticket')
        other_ticket = self.create_ticket(other_event, name='Other Organizer Ticket')
        booking = self.create_booking([
            {
                'ticket': selected_ticket,
                'quantity': 1,
                'unit_price': Decimal('40.00'),
                'subtotal': Decimal('40.00'),
            },
            {
                'ticket': sibling_ticket,
                'quantity': 1,
                'unit_price': Decimal('50.00'),
                'subtotal': Decimal('50.00'),
            },
            {
                'ticket': other_ticket,
                'quantity': 1,
                'unit_price': Decimal('60.00'),
                'subtotal': Decimal('60.00'),
            },
        ])
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        recent_booking = response.data['recent_bookings'][0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['booking_value'], Decimal('40.00'))
        self.assertEqual(recent_booking['booking_reference'], booking.booking_reference)
        self.assertEqual(recent_booking['booking_value'], Decimal('40.00'))
        self.assertEqual(len(recent_booking['items']), 1)
        self.assertEqual(recent_booking['items'][0]['ticket_type_name'], 'Selected Ticket')
        serialized_text = str(response.data)
        self.assertNotIn('Sibling Ticket', serialized_text)
        self.assertNotIn('Other Organizer Ticket', serialized_text)
        self.assertNotIn('Other Organizer Event', serialized_text)

    def test_recent_bookings_are_newest_first_limited_and_event_scoped(self):
        event = self.create_event(title='Recent Performance Event')
        other_event = self.create_event(title='Other Recent Event')
        ticket = self.create_ticket(event)
        other_ticket = self.create_ticket(other_event)
        event_bookings = []
        for index in range(6):
            event_bookings.append(self.create_booking([
                {
                    'ticket': ticket,
                    'quantity': 1,
                    'unit_price': Decimal('25.00'),
                    'subtotal': Decimal('25.00'),
                },
            ], minutes_offset=index))
        other_booking = self.create_booking([
            {
                'ticket': other_ticket,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ], minutes_offset=99)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        references = [
            booking['booking_reference']
            for booking in response.data['recent_bookings']
        ]
        expected_references = [
            booking.booking_reference
            for booking in sorted(
                event_bookings,
                key=lambda booking: booking.created_at,
                reverse=True,
            )[:5]
        ]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(references, expected_references)
        self.assertNotIn(other_booking.booking_reference, references)

    def test_recent_bookings_do_not_expose_attendee_personal_information(self):
        event = self.create_event(title='Privacy Event')
        ticket = self.create_ticket(event)
        self.create_booking([
            {
                'ticket': ticket,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ])
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        recent_booking = response.data['recent_bookings'][0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('user', recent_booking)
        self.assertNotIn('username', recent_booking)
        self.assertNotIn('email', recent_booking)

    def test_empty_event_returns_zero_summary_and_empty_lists(self):
        event = self.create_event(title='Empty Performance Event')
        self.client.force_authenticate(user=self.organizer)

        response = self.client.get(f'/api/events/{event.id}/performance/')

        summary = response.data['summary']
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary['ticket_capacity'], 0)
        self.assertEqual(summary['tickets_sold'], 0)
        self.assertEqual(summary['tickets_available'], 0)
        self.assertEqual(summary['booking_value'], Decimal('0.00'))
        self.assertEqual(summary['total_bookings'], 0)
        self.assertEqual(summary['pending_bookings'], 0)
        self.assertEqual(summary['confirmed_bookings'], 0)
        self.assertEqual(summary['cancelled_bookings'], 0)
        self.assertEqual(summary['expired_bookings'], 0)
        self.assertEqual(response.data['ticket_types'], [])
        self.assertEqual(response.data['recent_bookings'], [])

    def test_existing_analytics_and_attendee_booking_endpoints_remain_unchanged(self):
        event = self.create_event(title='Existing Endpoint Event')
        ticket = self.create_ticket(event)
        booking = self.create_booking([
            {
                'ticket': ticket,
                'quantity': 1,
                'unit_price': Decimal('25.00'),
                'subtotal': Decimal('25.00'),
            },
        ])

        self.client.force_authenticate(user=self.organizer)
        analytics_response = self.client.get('/api/events/analytics/')

        self.client.force_authenticate(user=self.attendee)
        attendee_bookings_response = self.client.get('/api/bookings/')
        attendee_booking_detail_response = self.client.get(
            f'/api/bookings/{booking.booking_reference}/',
        )

        self.assertEqual(analytics_response.status_code, status.HTTP_200_OK)
        self.assertIn('summary', analytics_response.data)
        self.assertEqual(attendee_bookings_response.status_code, status.HTTP_200_OK)
        self.assertEqual(attendee_booking_detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            attendee_booking_detail_response.data['booking_reference'],
            booking.booking_reference,
        )


class EventMutationAPITests(EventAPITestCase):
    def test_authenticated_organizer_can_create_event_and_is_assigned(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post('/api/events/', self.event_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        event = Event.objects.get(id=response.data['id'])
        self.assertEqual(event.organizer, self.organizer)
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_client_cannot_choose_another_organizer(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(
            '/api/events/',
            self.event_payload(organizer=self.other_organizer.id),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Event.objects.get(id=response.data['id']).organizer, self.organizer)

    def test_unauthenticated_and_attendee_users_cannot_create_event(self):
        unauthenticated = self.client.post('/api/events/', self.event_payload(), format='json')
        self.client.force_authenticate(user=self.attendee)
        attendee = self.client.post('/api/events/', self.event_payload(title='Attendee Event'), format='json')

        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(attendee.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_event_dates_are_rejected(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(
            '/api/events/',
            self.event_payload(start_datetime=self.end.isoformat(), end_datetime=self.start.isoformat()),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_datetime', response.data)

    def test_owner_can_update_and_delete_event(self):
        event = self.create_event(status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.organizer)

        update_response = self.client.patch(f'/api/events/{event.id}/', {'city': 'Akureyri'}, format='json')
        delete_response = self.client.delete(f'/api/events/{event.id}/')

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Event.objects.filter(id=event.id).exists())

    def test_another_organizer_and_attendee_cannot_modify_event(self):
        event = self.create_event(status=Event.Status.DRAFT)

        self.client.force_authenticate(user=self.other_organizer)
        other_update = self.client.patch(f'/api/events/{event.id}/', {'city': 'Selfoss'}, format='json')
        other_delete = self.client.delete(f'/api/events/{event.id}/')

        self.client.force_authenticate(user=self.attendee)
        attendee_update = self.client.patch(f'/api/events/{event.id}/', {'city': 'Kopavogur'}, format='json')

        self.assertIn(other_update.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
        self.assertIn(other_delete.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
        self.assertEqual(attendee_update.status_code, status.HTTP_403_FORBIDDEN)


class EventPublishAPITests(EventAPITestCase):
    def test_owner_organizer_can_publish_own_draft(self):
        event = self.create_event(status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(f'/api/events/{event.id}/publish/')

        event.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Event.Status.PUBLISHED)
        self.assertEqual(event.status, Event.Status.PUBLISHED)

    def test_attendee_cannot_publish_event(self):
        event = self.create_event(status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.attendee)

        response = self.client.post(f'/api/events/{event.id}/publish/')

        event.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_unauthenticated_user_cannot_publish_event(self):
        event = self.create_event(status=Event.Status.DRAFT)

        response = self.client.post(f'/api/events/{event.id}/publish/')

        event.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_organizer_cannot_publish_another_organizers_event(self):
        event = self.create_event(status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.other_organizer)

        response = self.client.post(f'/api/events/{event.id}/publish/')

        event.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_already_published_event_cannot_be_published_again(self):
        event = self.create_event(status=Event.Status.PUBLISHED)
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(f'/api/events/{event.id}/publish/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status', response.data)

    def test_cancelled_and_completed_events_cannot_be_published(self):
        cancelled = self.create_event(title='Cancelled Event', status=Event.Status.CANCELLED)
        completed = self.create_event(title='Completed Event', status=Event.Status.COMPLETED)
        self.client.force_authenticate(user=self.organizer)

        cancelled_response = self.client.post(f'/api/events/{cancelled.id}/publish/')
        completed_response = self.client.post(f'/api/events/{completed.id}/publish/')

        cancelled.refresh_from_db()
        completed.refresh_from_db()
        self.assertEqual(cancelled_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(completed_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cancelled.status, Event.Status.CANCELLED)
        self.assertEqual(completed.status, Event.Status.COMPLETED)

    def test_published_event_appears_in_public_list_and_detail(self):
        event = self.create_event(status=Event.Status.DRAFT)
        self.client.force_authenticate(user=self.organizer)

        publish_response = self.client.post(f'/api/events/{event.id}/publish/')

        self.client.force_authenticate(user=None)
        list_response = self.client.get('/api/events/')
        detail_response = self.client.get(f'/api/events/{event.slug}/')

        event_ids = {event_data['id'] for event_data in list_response.data['results']}
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertIn(event.id, event_ids)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data['id'], event.id)


class TicketTypeAPITests(EventAPITestCase):
    def setUp(self):
        super().setUp()
        self.event = self.create_event(status=Event.Status.PUBLISHED)
        self.ticket = TicketType.objects.create(
            event=self.event,
            name='Regular',
            description='Standard admission',
            price=Decimal('25.00'),
            quantity=10,
            sold=0,
        )

    def ticket_payload(self, **overrides):
        payload = {
            'name': 'VIP',
            'description': 'VIP admission',
            'price': '50.00',
            'quantity': 5,
            'sold': 0,
        }
        payload.update(overrides)
        return payload

    def test_organizer_can_create_ticket_type_for_own_event(self):
        self.client.force_authenticate(user=self.organizer)

        response = self.client.post(f'/api/events/{self.event.id}/tickets/', self.ticket_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TicketType.objects.get(id=response.data['id']).event, self.event)

    def test_other_organizer_and_attendee_cannot_create_ticket_type(self):
        self.client.force_authenticate(user=self.other_organizer)
        other_response = self.client.post(f'/api/events/{self.event.id}/tickets/', self.ticket_payload(), format='json')

        self.client.force_authenticate(user=self.attendee)
        attendee_response = self.client.post(
            f'/api/events/{self.event.id}/tickets/',
            self.ticket_payload(name='Attendee Ticket'),
            format='json',
        )

        self.assertEqual(other_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(attendee_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_users_can_view_ticket_types_for_published_events(self):
        response = self.client.get(f'/api/events/{self.event.id}/tickets/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], self.ticket.name)

    def test_invalid_ticket_values_are_rejected(self):
        self.client.force_authenticate(user=self.organizer)

        negative_price = self.client.post(
            f'/api/events/{self.event.id}/tickets/',
            self.ticket_payload(name='Bad Price', price='-1.00'),
            format='json',
        )
        negative_quantity = self.client.post(
            f'/api/events/{self.event.id}/tickets/',
            self.ticket_payload(name='Bad Quantity', quantity=-1),
            format='json',
        )
        sold_over_quantity = self.client.post(
            f'/api/events/{self.event.id}/tickets/',
            self.ticket_payload(name='Oversold', quantity=1, sold=2),
            format='json',
        )

        self.assertEqual(negative_price.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(negative_quantity.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(sold_over_quantity.status_code, status.HTTP_400_BAD_REQUEST)

    def test_organizer_can_update_and_delete_unused_ticket_type(self):
        self.client.force_authenticate(user=self.organizer)

        update_response = self.client.patch(
            f'/api/events/{self.event.id}/tickets/{self.ticket.id}/',
            {'price': '30.00'},
            format='json',
        )
        delete_response = self.client.delete(f'/api/events/{self.event.id}/tickets/{self.ticket.id}/')

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TicketType.objects.filter(id=self.ticket.id).exists())

    def test_protected_ticket_type_cannot_be_deleted_when_booking_items_exist(self):
        booking = Booking.objects.create(user=self.attendee, total_amount=Decimal('25.00'))
        BookingItem.objects.create(
            booking=booking,
            ticket_type=self.ticket,
            quantity=1,
            unit_price=self.ticket.price,
            subtotal=self.ticket.price,
        )
        self.client.force_authenticate(user=self.organizer)

        response = self.client.delete(f'/api/events/{self.event.id}/tickets/{self.ticket.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TicketType.objects.filter(id=self.ticket.id).exists())
