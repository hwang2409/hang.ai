from rest_framework import serializers
from notes.models import Document, Folder, Tag, Image, Flashcard, FlashcardFolder, NoteShare, SharedNoteAccess
from accounts.models import User

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

class FlashcardFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = FlashcardFolder
        fields = ['id', 'name', 'parent_folder', 'note_folder', 'description', 'deleted', 'deleted_at', 'created_at', 'updated_at']
        read_only_fields = ['deleted', 'deleted_at']

class FlashcardSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    folder = serializers.PrimaryKeyRelatedField(
        queryset=FlashcardFolder.objects.all(), allow_null=True, required=False
    )
    is_due_for_review = serializers.ReadOnlyField()
    days_until_review = serializers.ReadOnlyField()
    
    class Meta:
        model = Flashcard
        fields = [
            'id', 'front', 'back', 'difficulty', 'folder', 'tags', 'tag_ids',
            'interval_days', 'repetitions', 'ease_factor', 'next_review',
            'is_due_for_review', 'days_until_review', 'created_at', 'updated_at',
            'deleted', 'deleted_at'
        ]
        read_only_fields = [
            'id', 'interval_days', 'repetitions', 'ease_factor', 'next_review',
            'is_due_for_review', 'days_until_review', 'created_at', 'updated_at',
            'deleted', 'deleted_at'
        ]
    
    def create(self, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        instance = super().create(validated_data)
        
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        
        return instance
    
    def update(self, instance, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        instance = super().update(instance, validated_data)
        
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        
        return instance


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user information in sharing contexts"""
    full_name = serializers.ReadOnlyField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name']


class NoteShareSerializer(serializers.ModelSerializer):
    """Serializer for note sharing"""
    shared_with = UserSerializer(read_only=True)
    shared_with_id = serializers.IntegerField(write_only=True)
    note = DocumentSerializer(read_only=True)
    note_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = NoteShare
        fields = [
            'id', 'note', 'note_id', 'shared_by', 'shared_with', 'shared_with_id',
            'permission', 'message', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'shared_by', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        # Set the shared_by to the current user
        validated_data['shared_by'] = self.context['request'].user
        return super().create(validated_data)


class SharedNoteAccessSerializer(serializers.ModelSerializer):
    """Serializer for tracking access to shared notes"""
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = SharedNoteAccess
        fields = ['id', 'share', 'user', 'action', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class SharedNoteSerializer(serializers.ModelSerializer):
    """Serializer for notes that have been shared with the current user"""
    tags = TagSerializer(many=True, read_only=True)
    shared_by = UserSerializer(read_only=True)
    share_id = serializers.IntegerField(read_only=True)
    permission = serializers.CharField(read_only=True)
    share_message = serializers.CharField(read_only=True)
    shared_at = serializers.DateTimeField(read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'unique_id', 'title', 'content', 'tags', 'created_at', 'updated_at',
            'shared_by', 'share_id', 'permission', 'share_message', 'shared_at'
        ]
        read_only_fields = ['id', 'unique_id', 'title', 'content', 'tags', 'created_at', 'updated_at']