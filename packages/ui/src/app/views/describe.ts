// "Describe your app": the seckit init wizard as a form. Answers start from seckit.yaml if it exists,
// otherwise from auto-detection, so most people only confirm and adjust.
import { type Child, h, humanize, icon, modal, plural, toast } from '../dom.js';

// Product names that humanize() would get wrong (e.g. "Ec2", "Dynamodb").
const VALUE_LABELS: Record<string, string> = {
  ec2: 'EC2', ecs: 'ECS / Fargate', eks: 'EKS', lambda: 'Lambda', elastic_beanstalk: 'Elastic Beanstalk', app_runner: 'App Runner',
  lightsail: 'Lightsail', batch: 'Batch', s3: 'S3', ebs: 'EBS', efs: 'EFS', fsx: 'FSx', backup: 'AWS Backup', rds: 'RDS',
  aurora: 'Aurora', dynamodb: 'DynamoDB', elasticache: 'ElastiCache', memorydb: 'MemoryDB', documentdb: 'DocumentDB',
  neptune: 'Neptune', keyspaces: 'Keyspaces', timestream: 'Timestream', workspaces: 'WorkSpaces', appstream: 'AppStream 2.0',
};
const label = (v: unknown) => VALUE_LABELS[String(v)] ?? humanize(v);
import { isHosted } from '../backend.js';
import { pickProject, pickTextFile } from '../hosted-files.js';
import { api, ApiError, store } from '../store.js';
import type { CatalogComponent, Detection, Manifest, ManifestComponent, OptionSchema, Platform, Preview } from '../types.js';
import { busy, button, callout, navigate, PLATFORM_ICONS, PLATFORM_LABELS, severityBadge, SEVERITIES } from '../ui.js';

interface Draft {
  name: string;
  platforms: Platform[];
  data_sensitivity: 'low' | 'medium' | 'high';
  assurance_level: 1 | 2 | 3;
  ai_assistants: string[];
  components: ManifestComponent[];
}

let draft: Draft | null = null;
/** True while the form has edits that are not saved yet (an update reload would lose them). */
let dirty = false;

export function hasUnsavedChanges(): boolean {
  return dirty;
}
let detection: Detection | null = null;
let confirmedOverwrite = false;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let lastPreview: Preview | null = null;
let issues: string[] = [];

function fromManifest(m: Manifest): Draft {
  return {
    name: m.app.name,
    platforms: [...m.app.platforms],
    data_sensitivity: m.app.data_sensitivity ?? 'medium',
    assurance_level: m.app.assurance_level ?? 2,
    ai_assistants: [...(m.ai_assistants ?? ['agents_md'])],
    components: structuredClone(m.components),
  };
}

function blankDraft(name: string): Draft {
  return { name, platforms: [], data_sensitivity: 'medium', assurance_level: 2, ai_assistants: ['agents_md'], components: [] };
}

function toManifest(d: Draft, catalog: CatalogComponent[]): Manifest {
  const visible = new Set(catalog.filter((c) => c.platforms.some((p) => d.platforms.includes(p))).map((c) => c.id));
  return {
    version: 1,
    app: { name: d.name.trim(), platforms: d.platforms, data_sensitivity: d.data_sensitivity, assurance_level: d.assurance_level },
    ai_assistants: d.ai_assistants,
    components: d.components.filter((c) => visible.has(c.type)),
  };
}

async function ensureDraft(): Promise<void> {
  if (draft) return;
  const state = store.state!;
  detection ??= await api.get<Detection>('/api/detect');
  if (state.manifest) draft = fromManifest(state.manifest);
  else if (detection.suggested) draft = fromManifest(detection.suggested);
  else draft = blankDraft(detection.detection.name ?? (isHosted() ? '' : state.project.name));
}

function schedulePreview(rerender: () => void): void {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    if (!draft || !store.catalog) return;
    try {
      lastPreview = await api.post<Preview>('/api/preview', { manifest: toManifest(draft, store.catalog.components) });
    } catch {
      lastPreview = null;
    }
    rerender();
  }, 300);
}

async function detectFromFolder(btn: HTMLButtonElement, rerender: () => void): Promise<void> {
  const picked = await pickProject({ folder: true });
  if (!picked) return;
  await busy(btn, async () => {
    detection = await api.post<Detection>('/api/detect', { files: picked.files, folder: picked.folder });
    const found = detection.detection.components.length;
    if (detection.suggested) {
      draft = fromManifest(detection.suggested);
      lastPreview = null;
      schedulePreview(rerender);
      toast(`Found ${plural(found, 'part')} of your app in ${plural(picked.read, 'file')}. Check the answers below.`);
    } else {
      toast('Nothing recognisable in that folder — answer the questions below instead.', 'info');
    }
    rerender();
  });
}

async function importManifest(btn: HTMLButtonElement, rerender: () => void): Promise<void> {
  let file: { name: string; text: string } | null;
  try {
    file = await pickTextFile('.yaml,.yml,text/yaml');
  } catch (e) {
    toast((e as Error).message, 'error');
    return;
  }
  if (!file) return;
  await busy(btn, async () => {
    await api.post('/api/manifest/import', { text: file!.text });
    await store.refresh();
    draft = fromManifest(store.state!.manifest!);
    toast(`Imported ${file!.name}`);
    rerender();
  });
}

// ——— form controls ———

function choiceCards<T>(name: string, choices: { value: T; label: string; hint?: string; icon?: string }[], isOn: (v: T) => boolean, toggle: (v: T) => void, multi: boolean): HTMLElement {
  return h(
    'div',
    { class: ['choice-cards', multi ? 'multi' : 'single'], role: multi ? 'group' : 'radiogroup', 'aria-label': name },
    choices.map((c) =>
      h(
        'button',
        { type: 'button', class: ['choice-card', isOn(c.value) ? 'on' : ''], role: multi ? 'checkbox' : 'radio', 'aria-checked': String(isOn(c.value)), onclick: () => toggle(c.value) },
        c.icon ? h('span', { class: 'choice-icon' }, icon(c.icon)) : null,
        h('span', { class: 'choice-text' }, h('strong', null, c.label), c.hint ? h('span', { class: 'muted small' }, c.hint) : null),
        h('span', { class: 'choice-check' }, icon('check')),
      ),
    ),
  );
}

function segmented(label: string, options: { value: unknown; label: string }[], current: unknown, set: (v: unknown) => void): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(current === o.value), class: current === o.value ? 'on' : '', onclick: () => set(o.value) }, o.label)),
  );
}

const NOT_SURE = Symbol('not-sure');

function optionField(component: CatalogComponent, instance: ManifestComponent, name: string, schema: OptionSchema, changed: () => void): HTMLElement {
  const required = (component.options.required ?? []).includes(name);
  const canBeUnsure = !required && schema.default === undefined;
  const title = schema.title ?? humanize(name);
  const current = instance[name];
  const set = (v: unknown) => {
    if (v === NOT_SURE || v === undefined) delete instance[name];
    else instance[name] = v;
    changed();
  };

  let control: HTMLElement;
  if (schema.type === 'boolean') {
    const value = current === undefined ? (canBeUnsure ? NOT_SURE : schema.default) : current;
    control = segmented(title, [{ value: true, label: 'Yes' }, { value: false, label: 'No' }, ...(canBeUnsure ? [{ value: NOT_SURE, label: 'Not sure' }] : [])], value, set);
  } else if (schema.enum) {
    const value = current === undefined ? (canBeUnsure ? NOT_SURE : schema.default) : current;
    const opts = [...schema.enum.map((v) => ({ value: v, label: label(v) })), ...(canBeUnsure ? [{ value: NOT_SURE, label: 'Not sure' }] : [])];
    if (opts.length <= 5) {
      control = segmented(title, opts, value, set);
    } else {
      const select = h('select', { class: 'input', 'aria-label': title, onchange: (e: Event) => {
        const i = Number((e.target as HTMLSelectElement).value);
        set(opts[i]!.value);
      } }, opts.map((o, i) => h('option', { value: String(i), selected: o.value === value }, o.label)));
      control = select;
    }
  } else if (schema.type === 'array' && schema.items?.enum) {
    const values = Array.isArray(current) ? (current as unknown[]) : [];
    control = h(
      'div',
      { class: 'chip-toggles', role: 'group', 'aria-label': title },
      schema.items.enum.map((v) =>
        h('button', { type: 'button', role: 'checkbox', 'aria-checked': String(values.includes(v)), class: ['chip-toggle', values.includes(v) ? 'on' : ''], onclick: () => {
          const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
          set(next.length > 0 ? next : undefined);
        } }, values.includes(v) ? icon('check') : icon('plus'), label(v)),
      ),
    );
  } else {
    control = h('input', { class: 'input', type: 'text', value: current === undefined ? '' : String(current), 'aria-label': title, onchange: (e: Event) => set((e.target as HTMLInputElement).value.trim() || undefined) });
  }
  return h('div', { class: 'field' }, h('label', { class: 'field-label' }, title), control);
}

function componentCard(component: CatalogComponent, rerender: () => void): HTMLElement {
  const d = draft!;
  const instances = d.components.filter((c) => c.type === component.id);
  const detected = detection?.detection.components.filter((c) => c.type === component.id) ?? [];
  const evidence = [...new Set(detected.flatMap((c) => c.evidence))];
  const on = instances.length > 0;
  const changed = () => {
    issues = [];
    dirty = true;
    schedulePreview(rerender);
    rerender();
  };

  const toggle = () => {
    if (on) d.components = d.components.filter((c) => c.type !== component.id);
    else {
      const fromDetection = detected.length > 0 ? detected.map((dc) => ({ type: component.id, ...(dc.name ? { name: dc.name } : {}), ...structuredClone(dc.options) })) : [{ type: component.id }];
      d.components.push(...fromDetection);
    }
    changed();
  };

  const props = Object.entries(component.options.properties ?? {});
  const multiple = component.id === 'database';

  return h(
    'article',
    { class: ['component-card', on ? 'on' : ''] },
    h(
      'header',
      { class: 'component-head' },
      h(
        'div',
        { class: 'component-title' },
        h('h3', null, component.name, detected.length > 0 ? h('span', { class: 'badge badge-detected', title: evidence.join(', ') }, icon('sparkle'), 'Detected') : null),
        h('p', { class: 'muted' }, component.question),
        evidence.length > 0 ? h('p', { class: 'evidence small' }, 'Found: ', evidence.slice(0, 4).join(', '), evidence.length > 4 ? ` +${evidence.length - 4}` : '') : null,
      ),
      h('button', { type: 'button', class: ['switch', on ? 'on' : ''], role: 'switch', 'aria-checked': String(on), 'aria-label': `${component.name}: ${on ? 'included' : 'not included'}`, onclick: toggle }, h('span', { class: 'switch-knob' })),
    ),
    on
      ? h(
          'div',
          { class: 'component-body' },
          instances.map((inst, i) =>
            h(
              'div',
              { class: 'instance' },
              instances.length > 1 || inst.name
                ? h(
                    'div',
                    { class: 'instance-head' },
                    h('input', { class: 'input input-sm', type: 'text', placeholder: `Name, e.g. ${component.id === 'database' ? 'users-db' : 'main'}`, value: inst.name ?? '', 'aria-label': 'Name', onchange: (e: Event) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) inst.name = v;
                      else delete inst.name;
                      changed();
                    } }),
                    instances.length > 1 ? button('Remove', { kind: 'ghost', small: true, icon: 'x', onClick: () => {
                      d.components.splice(d.components.indexOf(inst), 1);
                      changed();
                    } }) : null,
                  )
                : null,
              props.length > 0 ? h('div', { class: 'fields' }, props.map(([name, schema]) => optionField(component, inst, name, schema, changed))) : h('p', { class: 'muted small' }, 'No further questions.'),
              i === instances.length - 1 && multiple
                ? button(`Add another ${component.name.toLowerCase()}`, { kind: 'ghost', small: true, icon: 'plus', onClick: () => {
                    if (instances.length === 1 && !instances[0]!.name) instances[0]!.name = `${component.id}-1`;
                    d.components.push({ type: component.id, name: `${component.id}-${instances.length + 1}` });
                    changed();
                  } })
                : null,
            ),
          ),
        )
      : null,
  );
}

function section(num: number, title: string, text: string, ...body: Child[]): HTMLElement {
  return h('section', { class: 'form-section' }, h('div', { class: 'form-section-head' }, h('span', { class: 'section-num' }, String(num)), h('div', null, h('h2', null, title), h('p', { class: 'muted' }, text))), h('div', { class: 'form-section-body' }, body));
}

async function save(btn: HTMLButtonElement, thenContinue: boolean, rerender: () => void): Promise<void> {
  const d = draft!;
  const catalog = store.catalog!;
  const local: string[] = [];
  if (!d.name.trim()) local.push('Give your app a name.');
  if (d.platforms.length === 0) local.push('Choose at least one platform.');
  if (toManifest(d, catalog.components).components.length === 0) local.push('Turn on at least one part of your app.');
  if (local.length > 0) {
    issues = local;
    rerender();
    return;
  }
  const doSave = async () => {
    try {
      await api.post('/api/manifest', { manifest: toManifest(d, catalog.components) });
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        issues = e.issues;
        rerender();
        return;
      }
      throw e;
    }
    issues = [];
    dirty = false;
    toast('Saved your answers');
    await store.refresh();
    draft = fromManifest(store.state!.manifest!);
    if (thenContinue) navigate('kit');
  };

  if (store.state!.manifest && !confirmedOverwrite && !isHosted()) {
    modal(
      'Update seckit.yaml?',
      h('p', null, 'Your answers replace the current ', h('code', null, 'seckit.yaml'), '. Comments in that file are not kept.'),
      (close) => [
        button('Cancel', { kind: 'ghost', onClick: close }),
        button('Save', { kind: 'primary', onClick: () => {
          confirmedOverwrite = true;
          close();
          void busy(btn, doSave);
        } }),
      ],
    );
    return;
  }
  await busy(btn, doSave);
}

export function describeView(rerender: () => void): HTMLElement {
  const container = h('div', { class: 'describe' });
  if (!draft) {
    container.append(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Looking at your project…'));
    ensureDraft()
      .then(() => {
        schedulePreview(rerender);
        rerender();
      })
      .catch((e: Error) => container.replaceChildren(callout('error', 'Could not read the project', e.message)));
    return container;
  }

  const d = draft;
  const catalog = store.catalog!;
  const platformChoices = catalog.choices.platforms.map((c) => ({ ...c, icon: PLATFORM_ICONS[c.value] }));
  const visibleComponents = catalog.components.filter((c) => c.platforms.some((p) => d.platforms.includes(p)));
  const appComponents = visibleComponents.filter((c) => c.category !== 'cloud');
  const cloudComponents = visibleComponents.filter((c) => c.category === 'cloud');
  const detectedPlatforms = (detection?.detection.platforms ?? []).map((p) => PLATFORM_LABELS[p]);
  const showApp = appComponents.length > 0;
  const showCloud = cloudComponents.length > 0;
  const cloudOnly = showCloud && !showApp;
  const update = () => {
    issues = [];
    dirty = true;
    schedulePreview(rerender);
    rerender();
  };

  const nameInput = h('input', { class: 'input input-lg', type: 'text', value: d.name, 'aria-label': 'App name', placeholder: 'my-app', oninput: (e: Event) => {
    d.name = (e.target as HTMLInputElement).value;
    dirty = true;
  }, onchange: update });

  container.append(
    ...[
    h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        null,
        h('h1', null, 'Describe your app'),
        h('p', { class: 'lead' }, isHosted() ? 'Security Kit tailors your checklist to your answers. Answer the questions, or let it read your project folder to fill them in.' : 'Security Kit tailors the plan to your answers. We filled in what we could detect — check it and adjust.'),
      ),
      h(
        'div',
        { class: 'page-actions' },
        isHosted()
          ? [
              button('Detect from my project', { kind: 'secondary', icon: 'folder', onClick: (b) => void detectFromFolder(b, rerender) }),
              button('Import seckit.yaml', { kind: 'ghost', icon: 'file', onClick: (b) => void importManifest(b, rerender) }),
            ]
          : button('Reset to detected', { kind: 'ghost', icon: 'refresh', onClick: () => {
              draft = detection?.suggested ? fromManifest(detection.suggested) : blankDraft(store.state!.project.name);
              update();
            } }),
      ),
    ),
    isHosted()
      ? callout('info', 'Private by design', 'Everything runs in your browser. If you pick your project folder, only dependency and config files are read — here, on your computer. Nothing is uploaded, and .env files are never opened.')
      : null,
    store.state!.manifestError ? callout('warn', isHosted() ? 'Your saved answers have problems' : 'Your current seckit.yaml has problems', 'Saving this form will replace them with valid answers.') : null,
    section(
      1,
      'About your app',
      'The basics decide which parts of the security plan apply.',
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'App name'), nameInput),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label' }, 'Where does it run?', detectedPlatforms.length > 0 ? h('span', { class: 'muted small' }, ` Detected: ${detectedPlatforms.join(', ')}`) : null),
        choiceCards('Platforms', platformChoices, (v) => d.platforms.includes(v), (v) => {
          d.platforms = d.platforms.includes(v) ? d.platforms.filter((p) => p !== v) : [...d.platforms, v];
          // The AWS account checks apply to every AWS setup: turn them on with the cloud.
          if (v === 'cloud' && d.platforms.includes('cloud') && !d.components.some((c) => c.type.startsWith('aws_'))) d.components.push({ type: 'aws_account' });
          update();
        }, true),
        cloudOnly
          ? h('p', { class: 'muted small' }, 'Only the cloud is selected, so the questions below are about your AWS account and services. Add Web, Backend or a mobile platform to include your app’s code too.')
          : null,
      ),
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Most sensitive data it handles'), choiceCards('Data sensitivity', catalog.choices.sensitivity, (v) => d.data_sensitivity === v, (v) => {
        d.data_sensitivity = v;
        if (v === 'low' && d.assurance_level > 1) d.assurance_level = 1;
        update();
      }, false)),
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'How strict should the plan be?'), choiceCards('Assurance level', catalog.choices.levels, (v) => d.assurance_level === v, (v) => {
        d.assurance_level = v;
        update();
      }, false), h('p', { class: 'muted small' }, 'Based on OWASP ASVS levels. Most apps with user accounts should use level 2.')),
    ),
    showApp || !showCloud
      ? section(
          2,
          'What your app has',
          d.platforms.length === 0 ? 'Choose where your app runs first.' : 'Turn on each part your app has. Answer “Not sure” when in doubt — the plan then includes every control that could apply.',
          appComponents.map((c) => componentCard(c, rerender)),
        )
      : null,
    showCloud
      ? section(
          showApp ? 3 : 2,
          cloudOnly ? 'Your AWS account and services' : 'Where it runs in the cloud (AWS)',
          `${cloudOnly ? 'Turn on the parts of AWS you use' : 'Hosted on AWS? Turn on the services you use'}. Each adds checks based on the CIS AWS Benchmarks, with AWS CLI test cases.`,
          cloudComponents.map((c) => componentCard(c, rerender)),
        )
      : null,
    section(
      showApp && showCloud ? 4 : 3,
      'AI coding assistants',
      'Security Kit writes its rules into the instruction files these assistants read, so AI-written code follows your plan.',
      choiceCards('AI assistants', catalog.choices.assistants, (v) => d.ai_assistants.includes(v), (v) => {
        d.ai_assistants = d.ai_assistants.includes(v) ? d.ai_assistants.filter((a) => a !== v) : [...d.ai_assistants, v];
        update();
      }, true),
    ),
    issues.length > 0 ? callout('error', 'Please fix these first', h('ul', null, issues.map((i) => h('li', null, i)))) : null,
    ].filter((el): el is HTMLElement => el !== null),
  );

  const p = lastPreview;
  container.append(
    h(
      'div',
      { class: 'sticky-bar' },
      h(
        'div',
        { class: 'sticky-summary' },
        p?.valid
          ? [h('strong', null, `${plural(p.controls!, 'security control')}`), h('span', { class: 'muted' }, ` across ${plural(p.components!, 'component')}`), h('span', { class: 'sev-mini' }, SEVERITIES.filter((s) => p.bySeverity![s] > 0).map((s) => [severityBadge(s), h('span', null, String(p.bySeverity![s]))]))]
          : h('span', { class: 'muted' }, p?.message ?? 'Fill in the form to see your plan size.'),
      ),
      h(
        'div',
        { class: 'sticky-actions' },
        button('Save', { kind: 'secondary', onClick: (b) => void save(b, false, rerender) }),
        button('Save and continue', { kind: 'primary', icon: 'chevron', onClick: (b) => void save(b, true, rerender) }),
      ),
    ),
  );
  return container;
}

/** Forget the draft (e.g. after seckit.yaml changed elsewhere). */
export function resetDescribe(): void {
  dirty = false;
  draft = null;
  detection = null;
  lastPreview = null;
}
