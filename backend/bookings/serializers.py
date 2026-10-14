from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from events.models import Event, TicketType

from .models import Booking, BookingItem


class BookingItemCreateSerializer(serializers.Serializer):
    ticket_type = serializers.PrimaryKeyRelatedField(queryset=TicketType.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class BookingItemSerializer(serializers.ModelSerializer):
    ticket_type_id = serializers.IntegerField(source='ticket_type.id', read_only=True)
    ticket_type_name = serializers.CharField(source='ticket_type.name', read_only=True)
    event_id = serializers.IntegerField(source='ticket_type.event.id', read_only=True)
    event_title = serializers.CharField(source='ticket_type.event.title', read_only=True)

    class Meta:
        model = BookingItem
        fields = [
            'id',
            'ticket_type_id',
            'ticket_type_name',
            'event_id',
            'event_title',
            'quantity',
            'unit_price',
            'subtotal',
            'created_at',
        ]
        read_only_fields = fields


class BookingSerializer(serializers.ModelSerializer):
    items = BookingItemSerializer(many=True, read_only=True)
    event = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'booking_reference',
            'event',
            'status',
            'expires_at',
            'total_amount',
            'created_at',
            'updated_at',
            'items',
        ]
        read_only_fields = fields

    def get_event(self, obj):
        item = obj.items.first()
        if item is None:
            return None

        event = item.ticket_type.event
        return {
            'id': event.id,
            'title': event.title,
            'slug': event.slug,
            'image': event.image.url if event.image else None,
            'venue': event.venue,
            'address': event.address,
            'city': event.city,
            'start_datetime': event.start_datetime,
            'end_datetime': event.end_datetime,
        }


class OrganizerBookingSerializer(serializers.ModelSerializer):
    booking_value = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'booking_reference',
            'status',
            'created_at',
            'updated_at',
            'booking_value',
            'events',
            'items',
        ]
        read_only_fields = fields

    def get_organizer_items(self, obj):
        return list(getattr(obj, 'organizer_items', []))

    def get_booking_value(self, obj):
        if obj.status in [Booking.Status.CANCELLED, Booking.Status.EXPIRED]:
            return Decimal('0.00')

        return sum(
            (item.subtotal for item in self.get_organizer_items(obj)),
            Decimal('0.00'),
        )

    def get_events(self, obj):
        events_by_id = {}

        for item in self.get_organizer_items(obj):
            event = item.ticket_type.event
            events_by_id[event.id] = {
                'id': event.id,
                'title': event.title,
                'slug': event.slug,
            }

        return list(events_by_id.values())

    def get_items(self, obj):
        return [
            {
                'ticket_type_id': item.ticket_type_id,
                'ticket_type_name': item.ticket_type.name,
                'event_id': item.ticket_type.event_id,
                'event_title': item.ticket_type.event.title,
                'quantity': item.quantity,
                'unit_price': item.unit_price,
                'subtotal': item.subtotal,
            }
            for item in self.get_organizer_items(obj)
        ]


class BookingCreateSerializer(serializers.Serializer):
    items = BookingItemCreateSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('At least one ticket type is required.')

        ticket_type_ids = [item['ticket_type'].id for item in value]
        if len(ticket_type_ids) != len(set(ticket_type_ids)):
            raise serializers.ValidationError('Duplicate ticket types are not allowed.')

        event_ids = {item['ticket_type'].event_id for item in value}
        if len(event_ids) != 1:
            raise serializers.ValidationError('All ticket types must belong to the same event.')

        event = value[0]['ticket_type'].event
        if event.status != Event.Status.PUBLISHED:
            raise serializers.ValidationError('Tickets can only be booked for published events.')

        return value

    def create(self, validated_data):
        user = self.context['request'].user
        requested_items = validated_data['items']
        quantities_by_ticket_type_id = {
            item['ticket_type'].id: item['quantity']
            for item in requested_items
        }
        ticket_type_ids = sorted(quantities_by_ticket_type_id)

        with transaction.atomic():
            locked_ticket_types = (
                TicketType.objects.select_for_update()
                .select_related('event')
                .filter(id__in=ticket_type_ids)
                .order_by('id')
            )
            ticket_types_by_id = {ticket_type.id: ticket_type for ticket_type in locked_ticket_types}

            if set(ticket_types_by_id) != set(ticket_type_ids):
                raise serializers.ValidationError({'items': 'One or more ticket types do not exist.'})

            event_ids = {ticket_type.event_id for ticket_type in ticket_types_by_id.values()}
            if len(event_ids) != 1:
                raise serializers.ValidationError({'items': 'All ticket types must belong to the same event.'})

            event = next(iter(ticket_types_by_id.values())).event
            if event.status != Event.Status.PUBLISHED:
                raise serializers.ValidationError({'items': 'Tickets can only be booked for published events.'})

            total_amount = Decimal('0.00')
            booking_items = []

            for ticket_type_id in ticket_type_ids:
                ticket_type = ticket_types_by_id[ticket_type_id]
                quantity = quantities_by_ticket_type_id[ticket_type_id]

                if quantity > ticket_type.available_tickets:
                    raise serializers.ValidationError({
                        'items': f'Insufficient tickets available for {ticket_type.name}.',
                    })

                subtotal = ticket_type.price * quantity
                total_amount += subtotal
                booking_items.append((ticket_type, quantity, ticket_type.price, subtotal))

            booking = Booking.objects.create(user=user, total_amount=total_amount)

            for ticket_type, quantity, unit_price, subtotal in booking_items:
                BookingItem.objects.create(
                    booking=booking,
                    ticket_type=ticket_type,
                    quantity=quantity,
                    unit_price=unit_price,
                    subtotal=subtotal,
                )
                ticket_type.sold += quantity
                ticket_type.save(update_fields=['sold', 'updated_at'])

        return booking

    def to_representation(self, instance):
        return BookingSerializer(instance, context=self.context).data
