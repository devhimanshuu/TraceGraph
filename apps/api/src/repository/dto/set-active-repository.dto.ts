import { IsNotEmpty, IsString } from 'class-validator';

/** `POST /api/repository/active` — switch the active repository. */
export class SetActiveRepositoryDto {
  @IsString()
  @IsNotEmpty()
  repoId!: string;
}
