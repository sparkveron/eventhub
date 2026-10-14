from django.urls import path

from .views import (
    CategoryListView,
    EventPerformanceView,
    EventPublishView,
    EventViewSet,
    OrganizerAnalyticsView,
    OrganizerEventListView,
    TicketTypeViewSet,
)


app_name = 'events'

event_list = EventViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
event_detail = EventViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
ticket_list = TicketTypeViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
ticket_detail = TicketTypeViewSet.as_view({
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('analytics/', OrganizerAnalyticsView.as_view(), name='organizer-analytics'),
    path('my/', OrganizerEventListView.as_view(), name='organizer-event-list'),
    path('', event_list, name='event-list'),
    path('<int:event_id>/performance/', EventPerformanceView.as_view(), name='event-performance'),
    path('<int:event_id>/publish/', EventPublishView.as_view(), name='event-publish'),
    path('<int:event_id>/tickets/', ticket_list, name='ticket-list'),
    path('<int:event_id>/tickets/<int:pk>/', ticket_detail, name='ticket-detail'),
    path('<str:pk>/', event_detail, name='event-detail'),
]
