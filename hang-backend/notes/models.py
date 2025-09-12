from django.db import models
from django.conf import settings
import hashlib
import uuid

class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=7, default='#3b82f6')  # Hex color code
    
    def __str__(self):
        return self.name

class Folder(models.Model):
    name = models.CharField(max_length=255)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='folders', null=True, blank=True)
    parent_folder = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subfolders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Document(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='documents', null=True, blank=True)
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    tags = models.ManyToManyField(Tag, blank=True, related_name='documents')
    # Allow null while migrating/backfilling to avoid UNIQUE clashes on empty string
    unique_id = models.CharField(max_length=64, unique=True, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Ensure a primary key exists first
        if not self.pk:
            super().save(*args, **kwargs)

        # If unique_id is missing, deterministically set it to sha256(pk)
        if not self.unique_id:
            self.unique_id = hashlib.sha256(str(self.pk).encode()).hexdigest()
            # Persist only the unique_id to avoid recursion
            super().save(update_fields=["unique_id"])  # type: ignore
            return

        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Image(models.Model):
    """
    Model to store images as binary data in the database
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)  # e.g., 'image/png', 'image/jpeg'
    data = models.BinaryField()  # The actual image binary data
    size = models.PositiveIntegerField()  # File size in bytes
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='images', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.filename} ({self.content_type})"
    
    @property
    def url(self):
        """Return the URL to serve this image"""
        return f"/api/images/{self.id}/"