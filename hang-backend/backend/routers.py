from rest_framework import routers
from django.urls import path
from notes.viewsets import DocumentViewSet, FolderViewSet, TagViewSet
from notes.views import UploadImageView

router = routers.SimpleRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'tags', TagViewSet, basename='tag')

urlpatterns = router.urls + [
    path('upload/', UploadImageView.as_view(), name='upload-image'),
]