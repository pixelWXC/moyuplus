export class EpubSecurityError extends Error { constructor(message: string) { super(message); this.name = 'EpubSecurityError'; } }
export class EpubFormatError extends Error { constructor(message: string) { super(message); this.name = 'EpubFormatError'; } }
