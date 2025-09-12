from django.contrib import admin
from notes.models import Document, Folder, Tag, Image

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['title', 'unique_id', 'folder', 'created_at']
    list_filter = ['folder', 'created_at']
    search_fields = ['title', 'content']

@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent_folder', 'created_at']
    list_filter = ['parent_folder', 'created_at']
    search_fields = ['name']

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name', 'color']
    search_fields = ['name']

@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ['filename', 'content_type', 'size', 'created_at']
    list_filter = ['content_type', 'created_at']
    search_fields = ['filename']
    readonly_fields = ['id', 'size', 'created_at']
