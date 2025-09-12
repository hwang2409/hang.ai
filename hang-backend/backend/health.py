"""
Health check endpoint for deployment platforms
"""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import os


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint that returns 200 OK if the service is running
    """
    try:
        # Check if we can import Django modules
        from django.conf import settings
        from django.db import connection
        
        # Test database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        
        return JsonResponse({
            "status": "healthy",
            "service": "hang-ai-backend",
            "database": "connected"
        })
    except Exception as e:
        return JsonResponse({
            "status": "unhealthy",
            "service": "hang-ai-backend",
            "error": str(e)
        }, status=500)
