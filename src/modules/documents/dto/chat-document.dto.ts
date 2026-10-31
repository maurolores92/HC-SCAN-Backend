import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export interface ChatMessageHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatDocumentDto {
  @IsNotEmpty({ message: 'El mensaje de consulta es obligatorio.' })
  @IsString({ message: 'El mensaje debe ser una cadena de texto.' })
  @MaxLength(2000, { message: 'El mensaje no puede superar los 2000 caracteres.' })
  message: string;

  @IsOptional()
  @IsNumber({}, { message: 'El ID del documento debe ser numérico.' })
  documentId?: number;

  @IsOptional()
  @IsArray({ message: 'El historial de conversación debe ser un arreglo.' })
  conversationHistory?: ChatMessageHistoryItem[];
}

