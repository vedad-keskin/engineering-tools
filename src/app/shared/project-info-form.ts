import { Component, input, output } from '@angular/core';
export interface ProjectInfoModel {
  client?: string;
  projectName?: string;
  projectNo?: string;
  title?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
  date?: string;
  revision?: string;
  name?: string;
  id?: string;
}

@Component({
  selector: 'app-project-info-form',
  template: `
    <div class="field-grid cols-2">
      @for (field of fields(); track field.key) {
        <div class="field">
          <label>{{ field.label }}</label>
          <input
            [type]="field.key === 'date' ? 'date' : 'text'"
            [value]="read(field.key)"
            (input)="patch(field.key, $event)"
          />
        </div>
      }
    </div>
  `,
})
export class ProjectInfoForm {
  readonly model = input<ProjectInfoModel>({});
  readonly labels = input<Record<string, string>>({});
  readonly changed = output<ProjectInfoModel>();

  fields(): { key: keyof ProjectInfoModel; label: string }[] {
    const m = this.model();
    const l = this.labels();
    if ('name' in m && !('projectName' in m)) {
      return [
        { key: 'name', label: l['name'] ?? 'Project name' },
        { key: 'id', label: l['id'] ?? 'Project ID' },
      ];
    }
    return [
      { key: 'client', label: l['client'] ?? 'Client' },
      { key: 'projectName', label: l['projectName'] ?? 'Project name' },
      { key: 'projectNo', label: l['projectNo'] ?? 'Project number' },
      { key: 'title', label: l['title'] ?? 'Document title' },
      { key: 'preparedBy', label: l['preparedBy'] ?? 'Prepared by' },
      { key: 'checkedBy', label: l['checkedBy'] ?? 'Checked by' },
      { key: 'approvedBy', label: l['approvedBy'] ?? 'Approved by' },
      { key: 'date', label: l['date'] ?? 'Date' },
      { key: 'revision', label: l['revision'] ?? 'Revision' },
    ];
  }

  read(key: keyof ProjectInfoModel): string {
    return String(this.model()[key] ?? '');
  }

  patch(key: keyof ProjectInfoModel, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.changed.emit({ ...this.model(), [key]: value });
  }
}
