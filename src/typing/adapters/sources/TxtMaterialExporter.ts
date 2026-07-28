import type { ContentCatalogStore } from '../storage';

export class TxtMaterialExporter {
  constructor(private readonly catalog: ContentCatalogStore) {}

  async export(materialId: string): Promise<string> {
    const record = await this.catalog.get(materialId);
    if (!record) {
      throw new Error(`Practice material not found: ${materialId}`);
    }
    return this.catalog.readBody(record.id, record.revision);
  }
}
