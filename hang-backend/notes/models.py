from django.db import models
import hashlib

class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=7, default='#3b82f6')  # Hex color code
    
    def __str__(self):
        return self.name

class Folder(models.Model):
    name = models.CharField(max_length=255)
    parent_folder = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subfolders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Document(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, null=True)
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