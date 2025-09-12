from rest_framework import serializers
from notes.models import Document, Folder, Tag, Image

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name', 'color']

class DocumentSerializer(serializers.ModelSerializer):
    content = serializers.CharField(allow_blank=True, required=False)
    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), allow_null=True, required=False
    )
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    
    class Meta:
        model = Document
        fields = ['id', 'unique_id', 'title', 'content', 'folder', 'tags', 'tag_ids', 'deleted', 'deleted_at', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at', 'id', 'unique_id', 'deleted', 'deleted_at']
    
    def update(self, instance, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        instance = super().update(instance, validated_data)
        
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        
        return instance

class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent_folder', 'deleted', 'deleted_at', 'created_at', 'updated_at']
        read_only_fields = ['deleted', 'deleted_at']

class ImageSerializer(serializers.ModelSerializer):
    url = serializers.ReadOnlyField()
    
    class Meta:
        model = Image
        fields = ['id', 'filename', 'content_type', 'size', 'url', 'created_at']
        read_only_fields = ['id', 'size', 'url', 'created_at']