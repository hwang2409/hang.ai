from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
import os
import hashlib
import secrets


class UploadImageView(APIView):
    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.content_type.startswith('image/'):
            return Response({'detail': 'Unsupported file type'}, status=status.HTTP_400_BAD_REQUEST)
        content = file_obj.read()
        # Hash content and add random salt to avoid conflicts across identical files
        digest = hashlib.sha256(content + secrets.token_bytes(8)).hexdigest()
        ext = os.path.splitext(file_obj.name)[1].lower() or '.bin'
        filename = f"uploads/{digest}{ext}"
        path = default_storage.save(filename, ContentFile(content))
        # Build absolute URL using the storage URL (typically /media/...)
        storage_url = default_storage.url(path) if hasattr(default_storage, 'url') else f"{settings.MEDIA_URL}{path}"
        url = request.build_absolute_uri(storage_url)
        return Response({'url': url}, status=status.HTTP_201_CREATED)
from django.shortcuts import render

# Create your views here.
