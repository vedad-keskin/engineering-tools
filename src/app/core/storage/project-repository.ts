import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';

export type ToolId = 'lv-cable-sizing' | 'power-network' | 'lightning-risk';

export interface ProjectMeta {
  id: string;
  toolId: ToolId;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProject<T = unknown> extends ProjectMeta {
  data: T;
}

interface EtDb extends DBSchema {
  projects: {
    key: string;
    value: StoredProject;
    indexes: { 'by-tool': string; 'by-updated': number };
  };
}

@Injectable({ providedIn: 'root' })
export class ProjectRepository {
  private readonly dbPromise: Promise<IDBPDatabase<EtDb>> = openDB<EtDb>('engineering-tools', 1, {
    upgrade(db) {
      const store = db.createObjectStore('projects', { keyPath: 'id' });
      store.createIndex('by-tool', 'toolId');
      store.createIndex('by-updated', 'updatedAt');
    },
  });

  async list(toolId?: ToolId): Promise<ProjectMeta[]> {
    const db = await this.dbPromise;
    const all = await db.getAll('projects');
    const rows = toolId ? all.filter((p) => p.toolId === toolId) : all;
    return rows
      .map(({ data: _data, ...meta }) => meta)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get<T>(id: string): Promise<StoredProject<T> | undefined> {
    const db = await this.dbPromise;
    return db.get('projects', id) as Promise<StoredProject<T> | undefined>;
  }

  async save<T>(project: StoredProject<T>): Promise<void> {
    const db = await this.dbPromise;
    await db.put('projects', { ...project, updatedAt: Date.now() } as StoredProject);
  }

  async create<T>(toolId: ToolId, name: string, data: T): Promise<StoredProject<T>> {
    const now = Date.now();
    const project: StoredProject<T> = {
      id: crypto.randomUUID(),
      toolId,
      name,
      createdAt: now,
      updatedAt: now,
      data,
    };
    await this.save(project);
    return project;
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('projects', id);
  }

  async duplicate(id: string): Promise<StoredProject | undefined> {
    const src = await this.get(id);
    if (!src) return undefined;
    return this.create(src.toolId, `${src.name} copy`, structuredClone(src.data));
  }
}
