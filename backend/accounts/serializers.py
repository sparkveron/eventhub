from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Profile


User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    user_type = serializers.CharField(source='profile.user_type')
    phone_number = serializers.CharField(source='profile.phone_number')
    profile_picture = serializers.ImageField(source='profile.profile_picture')

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'user_type',
            'phone_number',
            'profile_picture',
        ]
        read_only_fields = fields


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    password_confirm = serializers.CharField(write_only=True, style={'input_type': 'password'})
    user_type = serializers.ChoiceField(choices=Profile.UserType.choices)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'password_confirm', 'user_type']
        read_only_fields = ['id']

    def validate_email(self, value):
        normalized_email = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized_email

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        validate_password(attrs['password'])
        return attrs

    def create(self, validated_data):
        user_type = validated_data.pop('user_type')
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')

        user = User(**validated_data)
        user.set_password(password)
        user.save()
        Profile.objects.create(user=user, user_type=user_type)
        return user

    def to_representation(self, instance):
        return UserProfileSerializer(instance, context=self.context).data


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserProfileSerializer(self.user, context=self.context).data
        return data
