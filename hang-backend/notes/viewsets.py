from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.http import Http404
from notes.models import Document, Folder, Tag
from notes.serializers import DocumentSerializer, FolderSerializer, TagSerializer

class DocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    lookup_field = 'unique_id'

    def get_object(self):
        """
        Override get_object to handle both unique_id and id lookups
        """
        lookup_value = self.kwargs.get(self.lookup_field)
        
        # Try to find by unique_id first
        try:
            return get_object_or_404(Document, unique_id=lookup_value)
        except:
            # Fallback to id lookup for backward compatibility
            try:
                return get_object_or_404(Document, id=lookup_value)
            except:
                raise Http404("Document not found")


class FolderViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer


class TagViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset = Tag.objects.all()
    serializer_class = TagSerializer