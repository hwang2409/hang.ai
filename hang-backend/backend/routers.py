from rest_framework import routers
from django.urls import path
from notes.viewsets import DocumentViewSet, FolderViewSet, TagViewSet, FlashcardViewSet, FlashcardFolderViewSet
from notes.views import UploadImageView

router = routers.SimpleRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'flashcards', FlashcardViewSet, basename='flashcard')
router.register(r'flashcard-folders', FlashcardFolderViewSet, basename='flashcardfolder')

urlpatterns = router.urls + [
    path('upload/', UploadImageView.as_view(), name='upload-image'),
]