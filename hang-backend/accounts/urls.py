from django.urls import path
from accounts.views import (
    UserRegistrationView,
    login_view,
    logout_view,
    user_profile_view,
    update_profile_view
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='user-register'),
    path('login/', login_view, name='user-login'),
    path('logout/', logout_view, name='user-logout'),
    path('profile/', user_profile_view, name='user-profile'),
    path('profile/update/', update_profile_view, name='user-profile-update'),
]
