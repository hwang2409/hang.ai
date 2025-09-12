from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.http import Http404
from notes.models import Document, Folder, Tag
from notes.serializers import DocumentSerializer, FolderSerializer, TagSerializer

class DocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSerializer
    lookup_field = 'unique_id'

    def get_queryset(self):
        """
        Filter documents by the current user
        """
        return Document.objects.filter(user=self.request.user)

    def get_object(self):
        """
        Override get_object to handle both unique_id and id lookups, filtered by user
        """
        lookup_value = self.kwargs.get(self.lookup_field)
        
        # Try to find by unique_id first, filtered by user
        try:
            return get_object_or_404(Document, unique_id=lookup_value, user=self.request.user)
        except:
            # Fallback to id lookup for backward compatibility
            try:
                return get_object_or_404(Document, id=lookup_value, user=self.request.user)
            except:
                raise Http404("Document not found")

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a document
        """
        serializer.save(user=self.request.user)


class FolderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FolderSerializer

    def get_queryset(self):
        """
        Filter folders by the current user
        """
        return Folder.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a folder
        """
        serializer.save(user=self.request.user)


class TagViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Tag.objects.all()
    serializer_class = TagSerializer