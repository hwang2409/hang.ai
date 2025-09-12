from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.http import http_date, parse_http_date
from django.utils import timezone
from notes.models import Image
from notes.serializers import ImageSerializer
import os


class UploadImageView(APIView):
    """
    Upload images and store them as binary data in the database
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not file_obj.content_type.startswith('image/'):
            return Response({'detail': 'Unsupported file type'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Read the file content
        content = file_obj.read()
        
        # Create Image instance
        image = Image.objects.create(
            filename=file_obj.name,
            content_type=file_obj.content_type,
            data=content,
            size=len(content),
            user=request.user
        )
        
        # Return the image URL for backward compatibility with frontend
        return Response({'url': image.url}, status=status.HTTP_201_CREATED)


class ServeImageView(APIView):
    """
    Serve images from the database
    """
    permission_classes = [AllowAny]
    
    def get(self, request, image_id):
        try:
            image = get_object_or_404(Image, id=image_id)

            # Prepare caching headers
            etag = f'W/"{image.id}-{image.size}"'
            last_modified = image.created_at

            # If-None-Match handling
            inm = request.META.get('HTTP_IF_NONE_MATCH')
            if inm and inm == etag:
                not_modified = HttpResponse(status=304)
                not_modified['ETag'] = etag
                not_modified['Cache-Control'] = 'public, max-age=31536000'
                not_modified['Last-Modified'] = http_date(last_modified.timestamp())
                return not_modified

            # If-Modified-Since handling
            ims = request.META.get('HTTP_IF_MODIFIED_SINCE')
            if ims:
                try:
                    ims_dt = timezone.datetime.fromtimestamp(parse_http_date(ims), tz=timezone.utc)
                    if last_modified and last_modified <= ims_dt:
                        not_modified = HttpResponse(status=304)
                        not_modified['ETag'] = etag
                        not_modified['Cache-Control'] = 'public, max-age=31536000'
                        not_modified['Last-Modified'] = http_date(last_modified.timestamp())
                        return not_modified
                except Exception:
                    pass
            
            # Return the image with proper headers
            response = HttpResponse(image.data, content_type=image.content_type)
            response['Content-Length'] = image.size
            response['Cache-Control'] = 'public, max-age=31536000'  # Cache for 1 year
            response['ETag'] = etag
            if last_modified:
                response['Last-Modified'] = http_date(last_modified.timestamp())
            
            return response
            
        except Exception as e:
            return Response(
                {'detail': f'Error serving image: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
