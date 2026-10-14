from decimal import Decimal

from django.db.models import Count, DecimalField, IntegerField, Prefetch, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.db.models.deletion import ProtectedError
from rest_framework import filters, generics, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone

from bookings.models import Booking, BookingItem
from .models import Category, Event, TicketType
from .permissions import IsEventOrganizerOrReadOnly, IsOrganizerUser, is_organizer
from .serializers import (
    CategorySerializer,
    EventDetailSerializer,
    EventListSerializer,
    EventWriteSerializer,
    TicketTypeSerializer,
)


BOOKING_VALUE_STATUSES = [
    Booking.Status.PENDING,
    Booking.Status.CONFIRMED,
]
BOOKING_VALUE_EXCLUDED_STATUSES = [
    Booking.Status.CANCELLED,
    Booking.Status.EXPIRED,
]


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]


class OrganizerEventListView(generics.ListAPIView):
    serializer_class = EventListSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizerUser]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['created_at', 'start_datetime', 'title', 'status']
    ordering = ['start_datetime', 'title']

    def get_queryset(self):
        queryset = (
            Event.objects.select_related('category', 'organizer', 'organizer__profile')
            .prefetch_related('ticket_types')
            .filter(organizer=self.request.user)
        )

        status_filter = self.request.query_params.get('status')
        if status_filter:
            valid_statuses = {choice[0] for choice in Event.Status.choices}
            if status_filter in valid_statuses:
                queryset = queryset.filter(status=status_filter)
            else:
                queryset = queryset.none()

        return queryset


class OrganizerAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOrganizerUser]

    recent_booking_limit = 5
    upcoming_event_limit = 5

    def get(self, request):
        organizer = request.user
        organizer_events = Event.objects.filter(organizer=organizer)

        status_counts = {
            Event.Status.DRAFT: 0,
            Event.Status.PUBLISHED: 0,
            Event.Status.CANCELLED: 0,
            Event.Status.COMPLETED: 0,
        }
        for row in organizer_events.values('status').annotate(total=Count('id')):
            status_counts[row['status']] = row['total']

        ticket_totals = TicketType.objects.filter(event__organizer=organizer).aggregate(
            capacity=Coalesce(Sum('quantity'), Value(0), output_field=IntegerField()),
            sold=Coalesce(Sum('sold'), Value(0), output_field=IntegerField()),
        )
        ticket_capacity = ticket_totals['capacity']
        tickets_sold = ticket_totals['sold']

        booking_value = BookingItem.objects.filter(
            ticket_type__event__organizer=organizer,
        ).exclude(
            booking__status__in=BOOKING_VALUE_EXCLUDED_STATUSES,
        ).aggregate(
            total=Coalesce(
                Sum('subtotal'),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )['total']

        organizer_bookings = Booking.objects.filter(
            items__ticket_type__event__organizer=organizer,
        ).distinct()
        booking_status_counts = {
            Booking.Status.PENDING: 0,
            Booking.Status.CONFIRMED: 0,
            Booking.Status.CANCELLED: 0,
            Booking.Status.EXPIRED: 0,
        }
        for row in organizer_bookings.values('status').annotate(total=Count('id', distinct=True)):
            booking_status_counts[row['status']] = row['total']

        upcoming_events = (
            organizer_events
            .filter(
                start_datetime__gte=timezone.now(),
                status__in=[Event.Status.DRAFT, Event.Status.PUBLISHED],
            )
            .select_related('category', 'organizer', 'organizer__profile')
            .prefetch_related('ticket_types')
            .order_by('start_datetime', 'title')[:self.upcoming_event_limit]
        )

        organizer_booking_items = BookingItem.objects.filter(
            ticket_type__event__organizer=organizer,
        ).select_related('ticket_type', 'ticket_type__event')
        recent_bookings = (
            Booking.objects
            .filter(items__ticket_type__event__organizer=organizer)
            .prefetch_related(Prefetch(
                'items',
                queryset=organizer_booking_items,
                to_attr='organizer_items',
            ))
            .distinct()
            .order_by('-created_at')[:self.recent_booking_limit]
        )

        return Response({
            'summary': {
                'total_events': organizer_events.count(),
                'draft_events': status_counts[Event.Status.DRAFT],
                'published_events': status_counts[Event.Status.PUBLISHED],
                'cancelled_events': status_counts[Event.Status.CANCELLED],
                'completed_events': status_counts[Event.Status.COMPLETED],
                'total_ticket_capacity': ticket_capacity,
                'tickets_sold': tickets_sold,
                'tickets_available': ticket_capacity - tickets_sold,
                'booking_value': booking_value,
                'booking_value_statuses': BOOKING_VALUE_STATUSES,
                'pending_bookings': booking_status_counts[Booking.Status.PENDING],
                'confirmed_bookings': booking_status_counts[Booking.Status.CONFIRMED],
                'cancelled_bookings': booking_status_counts[Booking.Status.CANCELLED],
                'expired_bookings': booking_status_counts[Booking.Status.EXPIRED],
            },
            'upcoming_events': EventListSerializer(
                upcoming_events,
                many=True,
                context={'request': request},
            ).data,
            'recent_bookings': [
                self.serialize_recent_booking(booking)
                for booking in recent_bookings
            ],
        })

    def serialize_recent_booking(self, booking):
        organizer_items = list(getattr(booking, 'organizer_items', []))
        events_by_id = {}
        ticket_summary = []
        organizer_total = Decimal('0.00')

        for item in organizer_items:
            event = item.ticket_type.event
            events_by_id[event.id] = {
                'id': event.id,
                'title': event.title,
                'slug': event.slug,
            }
            if booking.status not in BOOKING_VALUE_EXCLUDED_STATUSES:
                organizer_total += item.subtotal
            ticket_summary.append({
                'ticket_type_id': item.ticket_type_id,
                'ticket_type_name': item.ticket_type.name,
                'event_id': event.id,
                'event_title': event.title,
                'quantity': item.quantity,
                'subtotal': item.subtotal,
            })

        return {
            'booking_reference': booking.booking_reference,
            'created_at': booking.created_at,
            'status': booking.status,
            'total_amount': organizer_total,
            'events': list(events_by_id.values()),
            'ticket_summary': ticket_summary,
        }


class EventPublishView(generics.GenericAPIView):
    serializer_class = EventDetailSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizerUser]

    def post(self, request, event_id):
        event = get_object_or_404(
            Event.objects.select_related('category', 'organizer', 'organizer__profile')
            .prefetch_related('ticket_types'),
            pk=event_id,
            organizer=request.user,
        )

        if event.status != Event.Status.DRAFT:
            raise ValidationError({
                'status': 'Only draft events can be published.',
            })

        event.status = Event.Status.PUBLISHED
        event.save(update_fields=['status', 'updated_at'])

        serializer = self.get_serializer(event)
        return Response(serializer.data, status=status.HTTP_200_OK)


class EventPerformanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOrganizerUser]

    recent_booking_limit = 5

    def get(self, request, event_id):
        event = get_object_or_404(
            Event.objects.filter(organizer=request.user),
            pk=event_id,
        )

        ticket_totals = TicketType.objects.filter(event=event).aggregate(
            capacity=Coalesce(Sum('quantity'), Value(0), output_field=IntegerField()),
            sold=Coalesce(Sum('sold'), Value(0), output_field=IntegerField()),
        )
        ticket_capacity = ticket_totals['capacity']
        tickets_sold = ticket_totals['sold']

        booking_value = BookingItem.objects.filter(
            ticket_type__event=event,
        ).exclude(
            booking__status__in=BOOKING_VALUE_EXCLUDED_STATUSES,
        ).aggregate(
            total=Coalesce(
                Sum('subtotal'),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )['total']

        event_bookings = Booking.objects.filter(items__ticket_type__event=event)
        status_counts = {
            Booking.Status.PENDING: 0,
            Booking.Status.CONFIRMED: 0,
            Booking.Status.CANCELLED: 0,
            Booking.Status.EXPIRED: 0,
        }
        for row in event_bookings.values('status').annotate(total=Count('id', distinct=True)):
            status_counts[row['status']] = row['total']

        ticket_types = (
            TicketType.objects
            .filter(event=event)
            .annotate(
                booking_value=Coalesce(
                    Sum(
                        'booking_items__subtotal',
                        filter=~Q(booking_items__booking__status__in=BOOKING_VALUE_EXCLUDED_STATUSES),
                    ),
                    Value(Decimal('0.00')),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by('price', 'name')
        )

        event_booking_items = (
            BookingItem.objects
            .filter(ticket_type__event=event)
            .select_related('ticket_type')
            .order_by('created_at')
        )
        recent_bookings = (
            event_bookings
            .prefetch_related(Prefetch(
                'items',
                queryset=event_booking_items,
                to_attr='event_items',
            ))
            .distinct()
            .order_by('-created_at')[:self.recent_booking_limit]
        )

        return Response({
            'event': {
                'id': event.id,
                'title': event.title,
                'slug': event.slug,
                'status': event.status,
                'start_datetime': event.start_datetime,
                'end_datetime': event.end_datetime,
            },
            'summary': {
                'ticket_capacity': ticket_capacity,
                'tickets_sold': tickets_sold,
                'tickets_available': ticket_capacity - tickets_sold,
                'booking_value': booking_value,
                'booking_value_statuses': BOOKING_VALUE_STATUSES,
                'total_bookings': event_bookings.distinct().count(),
                'pending_bookings': status_counts[Booking.Status.PENDING],
                'confirmed_bookings': status_counts[Booking.Status.CONFIRMED],
                'cancelled_bookings': status_counts[Booking.Status.CANCELLED],
                'expired_bookings': status_counts[Booking.Status.EXPIRED],
            },
            'ticket_types': [
                self.serialize_ticket_type(ticket_type)
                for ticket_type in ticket_types
            ],
            'recent_bookings': [
                self.serialize_recent_booking(booking)
                for booking in recent_bookings
            ],
        })

    def serialize_ticket_type(self, ticket_type):
        return {
            'id': ticket_type.id,
            'name': ticket_type.name,
            'price': ticket_type.price,
            'quantity': ticket_type.quantity,
            'sold': ticket_type.sold,
            'available_tickets': ticket_type.available_tickets,
            'booking_value': ticket_type.booking_value,
        }

    def serialize_recent_booking(self, booking):
        event_items = list(getattr(booking, 'event_items', []))
        booking_value = Decimal('0.00')
        items = []

        for item in event_items:
            if booking.status not in BOOKING_VALUE_EXCLUDED_STATUSES:
                booking_value += item.subtotal
            items.append({
                'ticket_type_id': item.ticket_type_id,
                'ticket_type_name': item.ticket_type.name,
                'quantity': item.quantity,
                'unit_price': item.unit_price,
                'subtotal': item.subtotal,
            })

        return {
            'booking_reference': booking.booking_reference,
            'status': booking.status,
            'created_at': booking.created_at,
            'booking_value': booking_value,
            'items': items,
        }


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventListSerializer
    permission_classes = [permissions.AllowAny, IsEventOrganizerOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description', 'venue', 'city']
    ordering_fields = ['created_at', 'start_datetime', 'title']
    ordering = ['start_datetime']

    def get_queryset(self):
        queryset = (
            Event.objects.select_related('category', 'organizer', 'organizer__profile')
            .prefetch_related('ticket_types')
        )
        user = self.request.user

        if self.action in ['list']:
            queryset = queryset.filter(status=Event.Status.PUBLISHED)
        elif self.action in ['retrieve']:
            if not user.is_authenticated:
                queryset = queryset.filter(status=Event.Status.PUBLISHED)
            else:
                queryset = queryset.filter(
                    Q(status=Event.Status.PUBLISHED) | Q(organizer=user)
                )
        elif self.action in ['update', 'partial_update', 'destroy']:
            queryset = queryset.filter(organizer=user)

        category = self.request.query_params.get('category')
        if category:
            if category.isdigit():
                queryset = queryset.filter(Q(category__slug=category) | Q(category_id=category))
            else:
                queryset = queryset.filter(category__slug=category)

        city = self.request.query_params.get('city')
        if city:
            queryset = queryset.filter(city__iexact=city)

        return queryset

    def get_object(self):
        lookup_value = self.kwargs.get(self.lookup_field)
        queryset = self.filter_queryset(self.get_queryset())

        if lookup_value and lookup_value.isdigit():
            return get_object_or_404(queryset, pk=lookup_value)

        return get_object_or_404(queryset, slug=lookup_value)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return EventWriteSerializer
        if self.action == 'retrieve':
            return EventDetailSerializer
        return EventListSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [
                permissions.IsAuthenticated(),
                IsOrganizerUser(),
                IsEventOrganizerOrReadOnly(),
            ]
        return super().get_permissions()

    def perform_create(self, serializer):
        if not is_organizer(self.request.user):
            raise PermissionDenied('Only organizers can create events.')
        serializer.save(organizer=self.request.user)


class TicketTypeViewSet(viewsets.ModelViewSet):
    serializer_class = TicketTypeSerializer

    def get_event(self):
        return get_object_or_404(
            Event.objects.select_related('organizer'),
            pk=self.kwargs['event_id'],
        )

    def get_queryset(self):
        event = self.get_event()
        user = self.request.user

        if self.request.method in permissions.SAFE_METHODS:
            if event.status == Event.Status.PUBLISHED or (
                user.is_authenticated and event.organizer == user
            ):
                return event.ticket_types.all()
            return TicketType.objects.none()

        return event.ticket_types.filter(event__organizer=user)

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def check_event_write_permission(self, event):
        if not is_organizer(self.request.user) or event.organizer != self.request.user:
            raise PermissionDenied('Only the event organizer can manage ticket types.')

    def perform_create(self, serializer):
        event = self.get_event()
        self.check_event_write_permission(event)
        serializer.save(event=event)

    def update(self, request, *args, **kwargs):
        self.check_event_write_permission(self.get_event())
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self.check_event_write_permission(self.get_event())
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self.check_event_write_permission(self.get_event())
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {'detail': 'Cannot delete a ticket type with existing booking items.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
