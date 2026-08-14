import { Matches } from 'class-validator';

export class ImportRepoDto {
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, {
    message: 'fullName must be in the form owner/name (e.g. octocat/Hello-World)',
  })
  fullName!: string;
}
