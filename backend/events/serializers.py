from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Category, Event, TicketType


User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = fields


class OrganizerSerializer(serializers.ModelSerializer):
    user_type = serializers.CharField(source='profile.user_type', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'user_type']
        read_only_fields = fields


class TicketTypeSerializer(serializers.ModelSerializer):
    available_tickets = serializers.IntegerField(read_only=True)

    class Meta:
        model = TicketType
        fields = [
            'id',
            'event',
            'name',
            'description',
            'price',
            'quantity',
            'sold',
            'available_tickets',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'event', 'available_tickets', 'created_at', 'updated_at']

    def validate(self, attrs):
        quantity = attrs.get('quantity', getattr(self.instance, 'quantity', None))
        sold = attrs.get('sold', getattr(self.instance, 'sold', 0))

        if quantity is not None and sold is not None and sold > quantity:
            raise serializers.ValidationError({'sold': 'Sold tickets cannot exceed quantity.'})

        return attrs


class EventListSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    organizer = OrganizerSerializer(read_only=True)
    ticket_types = TicketTypeSerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            'id',
            'title',
            'slug',
            'description',
            'image',
            'venue',
            'address',
            'city',
            'start_datetime',
            'end_datetime',
            'status',
            'category',
            'organizer',
            'ticket_types',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class EventDetailSerializer(EventListSerializer):
    pass


class EventWriteSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Event
        fields = [
            'id',
            'title',
            'slug',
            'description',
            'image',
            'venue',
            'address',
            'city',
            'start_datetime',
            'end_datetime',
            'status',
            'category',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

    def validate(self, attrs):
        start_datetime = attrs.get('start_datetime', getattr(self.instance, 'start_datetime', None))
        end_datetime = attrs.get('end_datetime', getattr(self.instance, 'end_datetime', None))

        if start_datetime and end_datetime and end_datetime <= start_datetime:
            raise serializers.ValidationError({
                'end_datetime': 'End datetime must be after start datetime.',
            })

        return attrs

    def create(self, validated_data):
        validated_data['organizer'] = self.context['request'].user
        return super().create(validated_data)

    def to_representation(self, instance):
        return EventDetailSerializer(instance, context=self.context).data
