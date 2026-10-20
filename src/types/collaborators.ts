/** POST /:domain/collaborators reply. */
export interface InviteResult {
  invites: Array<{ email: string; status: string }>
}

/** DELETE /:domain/collaborators reply. */
export interface RevokeResult {
  successes: unknown[]
  fails: unknown[]
}
