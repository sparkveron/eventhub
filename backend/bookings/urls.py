from django.urls import path

from .views import (
    BookingCancelView,
    BookingDetailView,
    BookingListCreateView,
    BookingPaymentInitializeView,
    BookingPaymentVerifyView,
    OrganizerBookingDetailView,
    OrganizerBookingListView,
)


app_name = 'bookings'

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('payment/verify/', BookingPaymentVerifyView.as_view(), name='payment-verify'),
    path('organizer/', OrganizerBookingListView.as_view(), name='organizer-booking-list'),
    path(
        'organizer/<str:booking_reference>/',
        OrganizerBookingDetailView.as_view(),
        name='organizer-booking-detail',
    ),
    path('<str:booking_reference>/', BookingDetailView.as_view(), name='booking-detail'),
    path('<str:booking_reference>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
    path(
        '<str:booking_reference>/payment/initialize/',
        BookingPaymentInitializeView.as_view(),
        name='payment-initialize',
    ),
]
