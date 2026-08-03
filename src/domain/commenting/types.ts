export type CommentRelationshipType =
  | 'general'
  | 'family'
  | 'close'
  | 'colleague'
  | 'stranger'
  | 'social';

export type CommentStyle = 'warm' | 'vivid' | 'concise';

export type GeneratedCommentCard = {
  style: CommentStyle;
  title: string;
  text: string;
};

export type CommentGenerationResult =
  | {
      status: 'needs-detail';
      message: string;
    }
  | {
      status: 'ready';
      cards: GeneratedCommentCard[];
    };
