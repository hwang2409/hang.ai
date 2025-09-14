from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.http import Http404
from django.utils import timezone
from django.db.models import Q
from notes.models import Document, Folder, Tag, Flashcard, FlashcardFolder, NoteShare, SharedNoteAccess
from notes.serializers import (
    DocumentSerializer, FolderSerializer, TagSerializer, FlashcardSerializer, 
    FlashcardFolderSerializer, NoteShareSerializer, SharedNoteAccessSerializer, 
    SharedNoteSerializer, UserSerializer
)
from accounts.models import User

class DocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSerializer
    lookup_field = 'unique_id'

    def get_queryset(self):
        """
        Filter documents by the current user, excluding deleted ones
        """
        return Document.objects.filter(user=self.request.user, deleted=False)

    def get_object(self):
        """
        Override get_object to handle both unique_id and id lookups, filtered by user
        """
        lookup_value = self.kwargs.get(self.lookup_field)
        
        # Try to find by unique_id first, filtered by user and not deleted
        try:
            return get_object_or_404(Document, unique_id=lookup_value, user=self.request.user, deleted=False)
        except:
            # Fallback to id lookup for backward compatibility
            try:
                return get_object_or_404(Document, id=lookup_value, user=self.request.user, deleted=False)
            except:
                raise Http404("Document not found")

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a document
        """
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete: mark document as deleted instead of actually deleting it
        """
        document = self.get_object()
        document.deleted = True
        document.deleted_at = timezone.now()
        document.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """
        Get all deleted documents for the current user
        """
        deleted_docs = Document.objects.filter(user=request.user, deleted=True)
        serializer = self.get_serializer(deleted_docs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, unique_id=None):
        """
        Restore a deleted document
        """
        document = get_object_or_404(Document, unique_id=unique_id, user=request.user, deleted=True)
        document.deleted = False
        document.deleted_at = None
        document.save()
        serializer = self.get_serializer(document)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def permanent_delete(self, request, unique_id=None):
        """
        Permanently delete a document from trash
        """
        document = get_object_or_404(Document, unique_id=unique_id, user=request.user, deleted=True)
        document.delete()  # This will actually delete from database
        return Response(status=status.HTTP_204_NO_CONTENT)


class FolderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FolderSerializer

    def get_queryset(self):
        """
        Filter folders by the current user, excluding deleted ones
        """
        return Folder.objects.filter(user=self.request.user, deleted=False)

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a folder
        """
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete: mark folder and all its documents as deleted
        """
        folder = self.get_object()
        
        # Soft delete all documents in this folder
        Document.objects.filter(folder=folder, user=request.user).update(
            deleted=True, 
            deleted_at=timezone.now()
        )
        
        # Soft delete the folder itself
        folder.deleted = True
        folder.deleted_at = timezone.now()
        folder.save()
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """
        Get all deleted folders for the current user
        """
        deleted_folders = Folder.objects.filter(user=request.user, deleted=True)
        serializer = self.get_serializer(deleted_folders, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """
        Restore a deleted folder and its documents
        """
        folder = get_object_or_404(Folder, pk=pk, user=request.user, deleted=True)
        folder.deleted = False
        folder.deleted_at = None
        folder.save()
        
        # Also restore all documents in this folder
        Document.objects.filter(folder=folder, user=request.user, deleted=True).update(
            deleted=False,
            deleted_at=None
        )
        
        serializer = self.get_serializer(folder)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def permanent_delete(self, request, pk=None):
        """
        Permanently delete a folder and all its documents from trash
        """
        folder = get_object_or_404(Folder, pk=pk, user=request.user, deleted=True)
        
        # Permanently delete all documents in this folder
        Document.objects.filter(folder=folder, user=request.user, deleted=True).delete()
        
        # Permanently delete the folder itself
        folder.delete()
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def move_to_folder(self, request, pk=None):
        """
        Move a folder into another folder (nesting)
        """
        folder = get_object_or_404(Folder, pk=pk, user=request.user, deleted=False)
        target_folder_id = request.data.get('target_folder_id')
        
        if target_folder_id is None:
            # Move to root level
            folder.parent_folder = None
        else:
            # Move to target folder
            target_folder = get_object_or_404(Folder, pk=target_folder_id, user=request.user, deleted=False)
            
            # Prevent moving folder into itself or its own subfolder
            if target_folder.id == folder.id:
                return Response({'error': 'Cannot move folder into itself'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if target is a subfolder of the folder being moved
            current = target_folder.parent_folder
            while current:
                if current.id == folder.id:
                    return Response({'error': 'Cannot move folder into its own subfolder'}, status=status.HTTP_400_BAD_REQUEST)
                current = current.parent_folder
            
            folder.parent_folder = target_folder
        
        folder.save()
        serializer = self.get_serializer(folder)
        return Response(serializer.data)


class TagViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Tag.objects.all()
    serializer_class = TagSerializer


class FlashcardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FlashcardSerializer

    def get_queryset(self):
        """
        Filter flashcards by the current user, excluding deleted ones
        """
        return Flashcard.objects.filter(user=self.request.user, deleted=False)

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a flashcard
        """
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete: mark flashcard as deleted
        """
        flashcard = self.get_object()
        flashcard.deleted = True
        flashcard.deleted_at = timezone.now()
        flashcard.save()
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def due_for_review(self, request):
        """
        Get flashcards that are due for review
        """
        due_cards = self.get_queryset().filter(next_review__lte=timezone.now())
        serializer = self.get_serializer(due_cards, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """
        Record a review session for a flashcard
        """
        flashcard = self.get_object()
        quality_rating = request.data.get('quality_rating')
        
        if quality_rating is None or not (0 <= quality_rating <= 5):
            return Response(
                {'error': 'quality_rating must be between 0 and 5'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        flashcard.update_review(quality_rating)
        serializer = self.get_serializer(flashcard)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get flashcard statistics for the user
        """
        queryset = self.get_queryset()
        
        stats = {
            'total_cards': queryset.count(),
            'due_for_review': queryset.filter(next_review__lte=timezone.now()).count(),
            'new_cards': queryset.filter(repetitions=0).count(),
            'learning_cards': queryset.filter(repetitions__gt=0, interval_days__lt=7).count(),
            'mature_cards': queryset.filter(interval_days__gte=7).count(),
        }
        
        return Response(stats)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """
        Get all deleted flashcards for the current user
        """
        deleted_flashcards = Flashcard.objects.filter(user=request.user, deleted=True)
        serializer = self.get_serializer(deleted_flashcards, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """
        Restore a deleted flashcard
        """
        flashcard = get_object_or_404(Flashcard, pk=pk, user=request.user, deleted=True)
        flashcard.deleted = False
        flashcard.deleted_at = None
        flashcard.save()
        
        serializer = self.get_serializer(flashcard)
        return Response(serializer.data)


class FlashcardFolderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FlashcardFolderSerializer

    def get_queryset(self):
        """
        Filter flashcard folders by the current user, excluding deleted ones
        """
        return FlashcardFolder.objects.filter(user=self.request.user, deleted=False)

    def perform_create(self, serializer):
        """
        Set the user to the current user when creating a flashcard folder
        """
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete: mark flashcard folder as deleted
        """
        folder = self.get_object()
        folder.deleted = True
        folder.deleted_at = timezone.now()
        folder.save()
        
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def move_to_folder(self, request, pk=None):
        """
        Move a flashcard folder to another flashcard folder
        """
        folder = self.get_object()
        target_folder_id = request.data.get('target_folder_id')
        
        if target_folder_id is None:
            folder.parent_folder = None
        else:
            try:
                target_folder = FlashcardFolder.objects.get(id=target_folder_id, user=request.user)
                folder.parent_folder = target_folder
            except FlashcardFolder.DoesNotExist:
                return Response(
                    {'error': 'Target folder not found'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        folder.save()
        serializer = self.get_serializer(folder)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def move_to_note_folder(self, request, pk=None):
        """
        Move a flashcard folder to a regular note folder
        """
        flashcard_folder = self.get_object()
        target_folder_id = request.data.get('target_folder_id')
        
        if target_folder_id is None:
            # Move to root level (no note folder)
            flashcard_folder.note_folder = None
        else:
            try:
                target_folder = Folder.objects.get(id=target_folder_id, user=request.user)
                flashcard_folder.note_folder = target_folder
            except Folder.DoesNotExist:
                return Response(
                    {'error': 'Target folder not found'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        flashcard_folder.save()
        serializer = self.get_serializer(flashcard_folder)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """
        Get all deleted flashcard folders for the current user
        """
        deleted_folders = FlashcardFolder.objects.filter(user=request.user, deleted=True)
        serializer = self.get_serializer(deleted_folders, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """
        Restore a deleted flashcard folder
        """
        folder = get_object_or_404(FlashcardFolder, pk=pk, user=request.user, deleted=True)
        folder.deleted = False
        folder.deleted_at = None
        folder.save()
        
        serializer = self.get_serializer(folder)
        return Response(serializer.data)


class NoteShareViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing note sharing
    """
    permission_classes = [IsAuthenticated]
    serializer_class = NoteShareSerializer
    
    def get_queryset(self):
        """
        Return shares where the current user is either the sharer or the recipient
        """
        return NoteShare.objects.filter(
            Q(shared_by=self.request.user) | Q(shared_with=self.request.user)
        ).select_related('note', 'shared_by', 'shared_with')
    
    def perform_create(self, serializer):
        """
        Set the shared_by to the current user when creating a share
        """
        serializer.save(shared_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def shared_with_me(self, request):
        """
        Get notes that have been shared with the current user
        """
        shares = NoteShare.objects.filter(shared_with=request.user).select_related('note', 'shared_by')
        
        # Create a list of notes with sharing metadata
        shared_notes = []
        for share in shares:
            note_data = SharedNoteSerializer(share.note, context={'request': request}).data
            note_data.update({
                'shared_by': UserSerializer(share.shared_by).data,
                'share_id': share.id,
                'permission': share.permission,
                'share_message': share.message,
                'shared_at': share.created_at
            })
            shared_notes.append(note_data)
        
        return Response(shared_notes)
    
    @action(detail=False, methods=['get'])
    def shared_by_me(self, request):
        """
        Get notes that the current user has shared with others
        """
        shares = NoteShare.objects.filter(shared_by=request.user).select_related('note', 'shared_with')
        serializer = self.get_serializer(shares, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        """
        Revoke a share (only the original sharer can do this)
        """
        share = get_object_or_404(NoteShare, pk=pk, shared_by=request.user)
        share.delete()
        return Response({'message': 'Share revoked successfully'}, status=status.HTTP_200_OK)


class SharedNoteAccessViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for tracking access to shared notes
    """
    permission_classes = [IsAuthenticated]
    serializer_class = SharedNoteAccessSerializer
    
    def get_queryset(self):
        """
        Return access logs for shares where the current user is involved
        """
        return SharedNoteAccess.objects.filter(
            Q(share__shared_by=self.request.user) | Q(share__shared_with=self.request.user)
        ).select_related('share', 'user', 'share__note')
    
    @action(detail=False, methods=['post'])
    def log_access(self, request):
        """
        Log access to a shared note
        """
        share_id = request.data.get('share_id')
        action_type = request.data.get('action', 'viewed')
        
        try:
            share = NoteShare.objects.get(
                id=share_id,
                shared_with=request.user
            )
            
            # Create access log
            SharedNoteAccess.objects.create(
                share=share,
                user=request.user,
                action=action_type
            )
            
            return Response({'message': 'Access logged successfully'}, status=status.HTTP_201_CREATED)
        except NoteShare.DoesNotExist:
            return Response({'error': 'Share not found'}, status=status.HTTP_404_NOT_FOUND)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for searching users to share notes with
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    
    def get_queryset(self):
        """
        Return users that can be searched for sharing
        Exclude the current user
        """
        return User.objects.exclude(id=self.request.user.id)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search for users by email or username
        """
        query = request.query_params.get('q', '')
        if not query:
            return Response({'error': 'Query parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        users = User.objects.filter(
            Q(email__icontains=query) | Q(username__icontains=query) | 
            Q(first_name__icontains=query) | Q(last_name__icontains=query)
        ).exclude(id=request.user.id)[:10]  # Limit to 10 results
        
        serializer = self.get_serializer(users, many=True)
        return Response(serializer.data)