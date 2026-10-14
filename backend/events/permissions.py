from rest_framework import permissions

from accounts.models import Profile


def is_organizer(user):
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, 'profile', None)
    return profile is not None and profile.user_type == Profile.UserType.ORGANIZER


class IsOrganizerUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_organizer(request.user)


class IsEventOrganizerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.organizer == request.user
