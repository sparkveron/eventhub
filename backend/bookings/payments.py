import hashlib
import hmac
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Booking, Payment
from .services import release_booking_inventory


class PaymentError(Exception):
    """Base class for safe, user-facing payment errors."""


class PaymentConfigurationError(PaymentError):
    pass


class PaymentProviderError(PaymentError):
    pass


class PaymentEligibilityError(PaymentError):
    pass


class PaymentNotFoundError(PaymentError):
    pass


@dataclass
class PaymentResult:
    payment: Payment
    booking: Booking
    outcome: str
    detail: str


def amount_to_subunit(amount):
    try:
        decimal_amount = Decimal(amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise PaymentConfigurationError('The booking amount could not be processed.') from exc

    if decimal_amount < 0 or decimal_amount != Decimal(amount):
        raise PaymentConfigurationError('The booking amount has an invalid precision.')

    return int(decimal_amount * 100)


def generate_payment_reference():
    return f'EHPT{uuid4().hex.upper()}'


def _require_provider_configuration():
    secret_key = getattr(settings, 'PAYSTACK_SECRET_KEY', '')
    currency = getattr(settings, 'PAYSTACK_CURRENCY', '')

    if not secret_key or not currency:
        raise PaymentConfigurationError('Paystack payment configuration is not available.')

    if len(currency) != 3 or not currency.isalpha():
        raise PaymentConfigurationError('Paystack currency configuration is invalid.')

    return secret_key, currency.upper()


def _provider_request(method, path, payload=None):
    secret_key, _ = _require_provider_configuration()
    base_url = getattr(settings, 'PAYSTACK_API_BASE_URL', 'https://api.paystack.co').rstrip('/')
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    request = Request(
        f'{base_url}{path}',
        data=body,
        headers={
            'Authorization': f'Bearer {secret_key}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'EventHub/1.0',
        },
        method=method,
    )

    try:
        with urlopen(request, timeout=getattr(settings, 'PAYSTACK_TIMEOUT_SECONDS', 10)) as response:
            response_data = json.loads(response.read().decode('utf-8'))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise PaymentProviderError('Paystack could not be reached. Please try again.') from exc

    if not isinstance(response_data, dict) or response_data.get('status') is not True:
        raise PaymentProviderError('Paystack did not accept the payment request.')

    return response_data.get('data') or {}


def _payment_callback_url(booking_reference):
    callback_url = getattr(settings, 'PAYSTACK_CALLBACK_URL', '')
    separator = '&' if '?' in callback_url else '?'
    return f'{callback_url}{separator}{urlencode({"booking_reference": booking_reference})}'


def initialize_checkout(booking_reference, user):
    secret_key, currency = _require_provider_configuration()
    del secret_key

    with transaction.atomic():
        booking = (
            Booking.objects.select_for_update()
            .filter(user=user, booking_reference=booking_reference)
            .first()
        )
        if booking is None:
            raise PaymentNotFoundError('Booking not found.')

        now = timezone.now()
        if booking.status != Booking.Status.PENDING or not booking.expires_at or booking.expires_at <= now:
            raise PaymentEligibilityError('This booking is no longer eligible for payment.')

        payments = booking.payments.order_by('-created_at')
        if payments.filter(status=Payment.Status.SUCCESSFUL).exists():
            raise PaymentEligibilityError('This booking has already been paid.')

        existing_payment = payments.filter(
            status__in=[Payment.Status.INITIALIZED, Payment.Status.PENDING],
        ).first()
        if existing_payment and existing_payment.authorization_url:
            return existing_payment

        payment = Payment.objects.create(
            booking=booking,
            payment_reference=generate_payment_reference(),
            provider=Payment.Provider.PAYSTACK,
            amount=booking.total_amount,
            currency=currency,
            status=Payment.Status.INITIALIZED,
        )

        try:
            provider_data = _provider_request(
                'POST',
                '/transaction/initialize',
                {
                    'email': user.email,
                    'amount': str(amount_to_subunit(payment.amount)),
                    'currency': payment.currency,
                    'reference': payment.payment_reference,
                    'callback_url': _payment_callback_url(booking.booking_reference),
                },
            )
            authorization_url = provider_data.get('authorization_url')
            provider_reference = provider_data.get('reference')
            if not authorization_url or provider_reference != payment.payment_reference:
                raise PaymentProviderError('Paystack returned an invalid checkout response.')
        except PaymentError:
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=['status', 'updated_at'])
            raise

        payment.authorization_url = authorization_url
        payment.status = Payment.Status.PENDING
        payment.save(update_fields=['authorization_url', 'status', 'updated_at'])
        return payment


def verify_paystack_transaction(payment_reference):
    return _provider_request(
        'GET',
        f'/transaction/verify/{payment_reference}',
    )


def _provider_metadata(provider_data):
    return {
        key: provider_data[key]
        for key in ('status', 'message', 'gateway_response')
        if provider_data.get(key) is not None
    }


def _mark_payment_failed(payment, detail, provider_data):
    payment.status = Payment.Status.FAILED
    payment.metadata = {
        **payment.metadata,
        **_provider_metadata(provider_data),
        'failure_reason': detail,
    }
    transaction_id = provider_data.get('id')
    if isinstance(transaction_id, int):
        payment.provider_transaction_id = transaction_id
    payment.save(update_fields=['status', 'metadata', 'provider_transaction_id', 'updated_at'])


def _fulfill_verified_payment(payment_id, provider_data):
    with transaction.atomic():
        payment_snapshot = Payment.objects.get(id=payment_id)
        booking = Booking.objects.select_for_update().get(id=payment_snapshot.booking_id)
        payment = Payment.objects.select_for_update().get(id=payment_id)

        if payment.status == Payment.Status.SUCCESSFUL:
            return PaymentResult(payment, booking, 'confirmed', 'Payment already confirmed.')

        expected_amount = amount_to_subunit(payment.amount)
        if provider_data.get('reference') != payment.payment_reference:
            detail = 'Paystack payment reference did not match.'
            _mark_payment_failed(payment, detail, provider_data)
            return PaymentResult(payment, booking, 'failed', detail)

        if provider_data.get('status') != 'success':
            provider_status = provider_data.get('status') or 'unknown'
            payment.status = (
                Payment.Status.ABANDONED
                if provider_status == 'abandoned'
                else Payment.Status.FAILED
            )
            payment.metadata = {
                **payment.metadata,
                **_provider_metadata(provider_data),
            }
            payment.save(update_fields=['status', 'metadata', 'updated_at'])
            return PaymentResult(payment, booking, 'not_successful', 'Payment was not successful.')

        try:
            provider_amount = int(provider_data.get('amount'))
        except (TypeError, ValueError):
            provider_amount = None

        if provider_amount != expected_amount:
            detail = 'Paystack payment amount did not match the booking total.'
            _mark_payment_failed(payment, detail, provider_data)
            return PaymentResult(payment, booking, 'failed', detail)

        if str(provider_data.get('currency', '')).upper() != payment.currency:
            detail = 'Paystack payment currency did not match the booking currency.'
            _mark_payment_failed(payment, detail, provider_data)
            return PaymentResult(payment, booking, 'failed', detail)

        transaction_id = provider_data.get('id')
        if not isinstance(transaction_id, int):
            detail = 'Paystack did not return a valid transaction identifier.'
            _mark_payment_failed(payment, detail, provider_data)
            return PaymentResult(payment, booking, 'failed', detail)

        if booking.status == Booking.Status.CONFIRMED:
            payment.status = Payment.Status.ABANDONED
            payment.provider_transaction_id = transaction_id
            payment.metadata = {
                **payment.metadata,
                **_provider_metadata(provider_data),
                'duplicate_payment_for_confirmed_booking': True,
            }
            payment.save(update_fields=['status', 'provider_transaction_id', 'metadata', 'updated_at'])
            return PaymentResult(payment, booking, 'confirmed', 'Booking is already confirmed.')

        if booking.status != Booking.Status.PENDING:
            payment.status = Payment.Status.ABANDONED
            payment.provider_transaction_id = transaction_id
            payment.metadata = {
                **payment.metadata,
                **_provider_metadata(provider_data),
                'booking_status_at_payment': booking.status,
                'late_payment': booking.status == Booking.Status.EXPIRED,
            }
            payment.save(update_fields=['status', 'provider_transaction_id', 'metadata', 'updated_at'])
            return PaymentResult(payment, booking, 'unavailable', 'This booking is no longer available.')

        if not booking.expires_at or booking.expires_at <= timezone.now():
            release_booking_inventory(booking)
            booking.status = Booking.Status.EXPIRED
            booking.save(update_fields=['status', 'updated_at'])
            payment.status = Payment.Status.ABANDONED
            payment.provider_transaction_id = transaction_id
            payment.metadata = {
                **payment.metadata,
                **_provider_metadata(provider_data),
                'late_payment': True,
            }
            payment.save(update_fields=['status', 'provider_transaction_id', 'metadata', 'updated_at'])
            return PaymentResult(payment, booking, 'expired', 'The reservation expired before payment was confirmed.')

        payment.status = Payment.Status.SUCCESSFUL
        payment.provider_transaction_id = transaction_id
        payment.paid_at = timezone.now()
        payment.metadata = {
            **payment.metadata,
            **_provider_metadata(provider_data),
        }
        payment.save(update_fields=['status', 'provider_transaction_id', 'paid_at', 'metadata', 'updated_at'])
        booking.status = Booking.Status.CONFIRMED
        booking.save(update_fields=['status', 'updated_at'])

        return PaymentResult(payment, booking, 'confirmed', 'Payment confirmed successfully.')


def verify_and_confirm_payment(payment_reference, user=None):
    payment_query = Payment.objects.select_related('booking')
    if user is not None:
        payment_query = payment_query.filter(booking__user=user)

    payment = payment_query.filter(payment_reference=payment_reference).first()
    if payment is None:
        raise PaymentNotFoundError('Payment reference not found.')

    if payment.status == Payment.Status.SUCCESSFUL:
        return PaymentResult(payment, payment.booking, 'confirmed', 'Payment already confirmed.')

    provider_data = verify_paystack_transaction(payment.payment_reference)
    return _fulfill_verified_payment(payment.id, provider_data)


def is_valid_webhook_signature(raw_body, signature):
    secret_key = getattr(settings, 'PAYSTACK_SECRET_KEY', '')
    if not secret_key or not signature:
        return False

    expected = hmac.new(
        secret_key.encode('utf-8'),
        raw_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
