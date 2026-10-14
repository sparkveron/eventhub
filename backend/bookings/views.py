import json

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Prefetch
from django.utils.dateparse import parse_date
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from events.models import Event
from events.permissions import IsOrganizerUser

from .models import Booking, BookingItem, Payment
from .payments import (
    PaymentConfigurationError,
    PaymentEligibilityError,
    PaymentNotFoundError,
    PaymentProviderError,
    initialize_checkout,
    is_valid_webhook_signature,
    verify_and_confirm_payment,
)
from .serializers import BookingCreateSerializer, BookingSerializer, OrganizerBookingSerializer
from .services import cancel_booking


class BookingPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50


class BookingListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = BookingPagination

    def get_queryset(self):
        return (
            Booking.objects.filter(user=self.request.user)
            .prefetch_related('items__ticket_type__event')
            .order_by('-created_at')
        )

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BookingCreateSerializer
        return BookingSerializer


class BookingDetailView(generics.RetrieveAPIView):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'booking_reference'

    def get_queryset(self):
        return (
            Booking.objects.filter(user=self.request.user)
            .prefetch_related('items__ticket_type__event')
        )


class OrganizerBookingQuerysetMixin:
    serializer_class = OrganizerBookingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizerUser]
    pagination_class = BookingPagination
    lookup_field = 'booking_reference'

    ordering_map = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'status': 'status',
        '-status': '-status',
    }

    def get_organizer_items_queryset(self):
        return (
            BookingItem.objects
            .filter(ticket_type__event__organizer=self.request.user)
            .select_related('ticket_type', 'ticket_type__event')
            .order_by('created_at')
        )

    def get_queryset(self):
        queryset = (
            Booking.objects
            .filter(items__ticket_type__event__organizer=self.request.user)
            .prefetch_related(Prefetch(
                'items',
                queryset=self.get_organizer_items_queryset(),
                to_attr='organizer_items',
            ))
            .distinct()
        )

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(booking_reference__icontains=search)

        event_id = self.request.query_params.get('event')
        if event_id:
            if not event_id.isdigit():
                raise ValidationError({'event': 'Event must be a valid event ID.'})
            if Event.objects.filter(id=event_id, organizer=self.request.user).exists():
                queryset = queryset.filter(items__ticket_type__event_id=event_id)
            else:
                queryset = queryset.none()

        status_filter = self.request.query_params.get('status')
        if status_filter:
            valid_statuses = {choice[0] for choice in Booking.Status.choices}
            if status_filter not in valid_statuses:
                raise ValidationError({'status': 'Invalid booking status.'})
            queryset = queryset.filter(status=status_filter)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            parsed_date_from = parse_date(date_from)
            if parsed_date_from is None:
                raise ValidationError({'date_from': 'Use YYYY-MM-DD format.'})
            queryset = queryset.filter(created_at__date__gte=parsed_date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            parsed_date_to = parse_date(date_to)
            if parsed_date_to is None:
                raise ValidationError({'date_to': 'Use YYYY-MM-DD format.'})
            queryset = queryset.filter(created_at__date__lte=parsed_date_to)

        ordering = self.request.query_params.get('ordering', '-created_at')
        if ordering not in self.ordering_map:
            raise ValidationError({
                'ordering': 'Invalid ordering. Use created_at, -created_at, status, or -status.',
            })

        return queryset.order_by(self.ordering_map[ordering])


class OrganizerBookingListView(OrganizerBookingQuerysetMixin, generics.ListAPIView):
    pass


class OrganizerBookingDetailView(OrganizerBookingQuerysetMixin, generics.RetrieveAPIView):
    pass


class BookingCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, booking_reference):
        booking, result = cancel_booking(booking_reference, request.user)

        if result == 'not_found':
            return Response(
                {'detail': 'Booking not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if result == 'already_cancelled':
            raise ValidationError({'detail': 'This booking is already cancelled.'})

        if result == 'not_cancellable':
            raise ValidationError({'detail': 'This booking cannot be cancelled.'})

        return Response({
            'detail': 'Booking cancelled successfully. No refund was processed.',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


def payment_error_response(error):
    if isinstance(error, PaymentNotFoundError):
        return Response({'detail': str(error)}, status=status.HTTP_404_NOT_FOUND)
    if isinstance(error, PaymentConfigurationError):
        return Response(
            {'detail': str(error)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if isinstance(error, PaymentProviderError):
        return Response(
            {'detail': str(error)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)


class BookingPaymentInitializeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, booking_reference):
        try:
            payment = initialize_checkout(booking_reference, request.user)
        except (
            PaymentConfigurationError,
            PaymentEligibilityError,
            PaymentNotFoundError,
            PaymentProviderError,
        ) as error:
            return payment_error_response(error)

        return Response({
            'authorization_url': payment.authorization_url,
            'payment_reference': payment.payment_reference,
            'booking_reference': payment.booking.booking_reference,
            'amount': str(payment.amount),
            'currency': payment.currency,
            'status': payment.status,
        }, status=status.HTTP_200_OK)


class BookingPaymentVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        payment_reference = request.data.get('reference')
        if not isinstance(payment_reference, str) or not payment_reference.strip():
            return Response(
                {'detail': 'A payment reference is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = verify_and_confirm_payment(payment_reference.strip(), request.user)
        except (
            PaymentConfigurationError,
            PaymentNotFoundError,
            PaymentProviderError,
        ) as error:
            return payment_error_response(error)

        response_data = {
            'detail': result.detail,
            'payment_status': result.payment.status,
            'booking': BookingSerializer(
                result.booking,
                context={'request': request},
            ).data,
        }

        if result.outcome == 'failed':
            return Response(response_data, status=status.HTTP_400_BAD_REQUEST)

        return Response(response_data, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class PaystackWebhookView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        signature = request.META.get('HTTP_X_PAYSTACK_SIGNATURE', '')
        if not is_valid_webhook_signature(request.body, signature):
            return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(request.body.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return Response({'detail': 'Invalid webhook payload.'}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get('event') != 'charge.success':
            return Response({'status': 'ignored'}, status=status.HTTP_200_OK)

        data = payload.get('data') or {}
        payment_reference = data.get('reference')
        if not isinstance(payment_reference, str) or not Payment.objects.filter(
            payment_reference=payment_reference,
            provider=Payment.Provider.PAYSTACK,
        ).exists():
            return Response({'status': 'ignored'}, status=status.HTTP_200_OK)

        try:
            result = verify_and_confirm_payment(payment_reference)
        except PaymentProviderError:
            return Response(
                {'detail': 'Payment verification is temporarily unavailable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except (PaymentConfigurationError, PaymentNotFoundError):
            return Response({'status': 'ignored'}, status=status.HTTP_200_OK)

        return Response({
            'status': 'processed',
            'payment_status': result.payment.status,
            'booking_status': result.booking.status,
        }, status=status.HTTP_200_OK)
