from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Profile


User = get_user_model()


class AuthenticationAPITests(APITestCase):
    def register_payload(self, **overrides):
        payload = {
            'username': 'testuser',
            'email': 'testuser@example.com',
            'password': 'ComplexPass123!',
            'password_confirm': 'ComplexPass123!',
            'user_type': Profile.UserType.ATTENDEE,
        }
        payload.update(overrides)
        return payload

    def test_successful_attendee_registration_creates_user_and_profile(self):
        response = self.client.post('/api/auth/register/', self.register_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='testuser')
        self.assertEqual(user.profile.user_type, Profile.UserType.ATTENDEE)
        self.assertTrue(user.check_password('ComplexPass123!'))
        self.assertNotEqual(user.password, 'ComplexPass123!')
        self.assertNotIn('password', response.data)
        self.assertNotIn('password_confirm', response.data)

    def test_successful_organizer_registration_creates_correct_profile_type(self):
        response = self.client.post(
            '/api/auth/register/',
            self.register_payload(
                username='organizer',
                email='organizer@example.com',
                user_type=Profile.UserType.ORGANIZER,
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username='organizer').profile.user_type, Profile.UserType.ORGANIZER)

    def test_duplicate_username_is_rejected(self):
        User.objects.create_user(username='testuser', email='existing@example.com', password='ComplexPass123!')

        response = self.client.post('/api/auth/register/', self.register_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_is_rejected(self):
        User.objects.create_user(username='existing', email='testuser@example.com', password='ComplexPass123!')

        response = self.client.post('/api/auth/register/', self.register_payload(username='newuser'), format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_password_confirmation_mismatch_is_rejected(self):
        response = self.client.post(
            '/api/auth/register/',
            self.register_payload(password_confirm='DifferentPass123!'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_weak_password_is_rejected(self):
        response = self.client.post(
            '/api/auth/register/',
            self.register_payload(password='password', password_confirm='password'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_valid_login_returns_tokens_and_user(self):
        user = User.objects.create_user(
            username='testuser',
            email='testuser@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=user, user_type=Profile.UserType.ATTENDEE)

        response = self.client.post(
            '/api/auth/login/',
            {'username': 'testuser', 'password': 'ComplexPass123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertNotIn('password', response.data['user'])

    def test_invalid_password_is_rejected(self):
        User.objects.create_user(username='testuser', email='testuser@example.com', password='ComplexPass123!')

        response = self.client.post(
            '/api/auth/login/',
            {'username': 'testuser', 'password': 'wrong-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nonexistent_user_login_is_rejected(self):
        response = self.client.post(
            '/api/auth/login/',
            {'username': 'missing', 'password': 'ComplexPass123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_valid_refresh_token_returns_access_token(self):
        user = User.objects.create_user(
            username='testuser',
            email='testuser@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=user, user_type=Profile.UserType.ATTENDEE)
        login_response = self.client.post(
            '/api/auth/login/',
            {'username': 'testuser', 'password': 'ComplexPass123!'},
            format='json',
        )

        response = self.client.post(
            '/api/auth/refresh/',
            {'refresh': login_response.data['refresh']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_invalid_refresh_token_is_rejected(self):
        response = self.client.post('/api/auth/refresh/', {'refresh': 'invalid-token'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_access_current_user(self):
        user = User.objects.create_user(
            username='testuser',
            email='testuser@example.com',
            password='ComplexPass123!',
        )
        Profile.objects.create(user=user, user_type=Profile.UserType.ORGANIZER, phone_number='123456')
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], user.id)
        self.assertEqual(response.data['username'], user.username)
        self.assertEqual(response.data['email'], user.email)
        self.assertEqual(response.data['user_type'], Profile.UserType.ORGANIZER)
        self.assertEqual(response.data['phone_number'], '123456')
        self.assertNotIn('password', response.data)

    def test_unauthenticated_current_user_is_rejected(self):
        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
