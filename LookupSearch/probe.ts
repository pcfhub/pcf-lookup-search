/*
 * THROWAWAY — probe 0.2.9. Deleted before 0.3.0 is written.
 *
 * Asks the live form what a dropdown mode rests on (SPEC.md, "Probe 0.2.9"):
 *   P1 getViewId() on a field control      P4 a deactivated row excluded
 *   P2 the table's default lookup view       P5 a parent condition as a sibling filter
 *   P3 a view's FetchXML, order kept, count  P6 how long 100 and 500 rows take
 *
 * In the console on the form:  await __lookupSearchProbe.all()
 * Each answer is logged as JSON and returned.
 */

type Ctx = ComponentFramework.Context<unknown>;

interface Probe {
    p1(): unknown;
    p2(): Promise<unknown>;
    p3(limit?: number, viewId?: string, parentColumn?: string, parentId?: string): Promise<unknown>;
    p4(): Promise<unknown>;
    p5(parentColumn?: string, parentId?: string): Promise<unknown>;
    p6(): Promise<unknown>;
    all(): Promise<unknown>;
}

const say = (label: string, value: unknown): unknown => {
    // eslint-disable-next-line no-console
    console.log(`[lookup-search probe] ${label}`, JSON.stringify(value, null, 2));
    return value;
};

const errorOf = (error: unknown): unknown => {
    if (error instanceof Error) {
        return { error: error.message };
    }

    return { error };
};

export function installProbe(read: () => Ctx): void {
    const lookup = (): ComponentFramework.PropertyTypes.LookupProperty =>
        (read().parameters as unknown as Record<string, ComponentFramework.PropertyTypes.LookupProperty>).value;

    const target = (): string => {
        try {
            return lookup().getTargetEntityType?.() ?? '';
        } catch {
            return '';
        }
    };

    const columns = async (): Promise<{ id: string; name: string }> => {
        const metadata = await read().utils.getEntityMetadata(target());
        return { id: String(metadata.PrimaryIdAttribute), name: String(metadata.PrimaryNameAttribute) };
    };

    const defaultLookupView = async (): Promise<{ id: string; name: string; fetchxml: string } | null> => {
        const answer = await read().webAPI.retrieveMultipleRecords(
            'savedquery',
            `?$select=savedqueryid,name,fetchxml&$filter=returnedtypecode eq '${target()}' and querytype eq 64 and isdefault eq true`,
        );
        const row = answer.entities[0];
        return row ? { id: String(row.savedqueryid), name: String(row.name), fetchxml: String(row.fetchxml) } : null;
    };

    const viewXml = async (viewId: string): Promise<string> => {
        try {
            const row = await read().webAPI.retrieveRecord('savedquery', viewId, '?$select=fetchxml');
            return String(row.fetchxml);
        } catch {
            const row = await read().webAPI.retrieveRecord('userquery', viewId, '?$select=fetchxml');
            return String(row.fetchxml);
        }
    };

    /** Every <attribute> out at every depth, <order> and <filter> kept, ours in, count = limit + 1. */
    const rewrite = (xml: string, id: string, name: string, limit: number, parent?: { column: string; id: string }): string => {
        let out = xml.replace(/<attribute\b[^>]*\/>/g, '').replace(/<attribute\b[^>]*>\s*<\/attribute>/g, '');
        out = out.replace(/<fetch\b([^>]*)>/, (_m, attrs: string) =>
            `<fetch${attrs.replace(/\s(count|top|page)=(['"])[^'"]*\2/g, '')} count="${limit + 1}">`);
        const extra = parent
            ? `<filter type="and"><condition attribute="${parent.column}" operator="eq" value="${parent.id}" /></filter>`
            : '';
        out = out.replace(/<entity\b([^>]*)>/, (m) => `${m}<attribute name="${id}" /><attribute name="${name}" />${extra}`);
        return out;
    };

    const probe: Probe = {
        p1() {
            const value = lookup();
            const parent = (read().parameters as unknown as Record<string, ComponentFramework.PropertyTypes.LookupProperty>).parentValue;
            let viewId: unknown;
            let parentViewId: unknown;
            try {
                viewId = value.getViewId?.();
            } catch (error) {
                viewId = errorOf(error);
            }
            try {
                parentViewId = parent?.getViewId?.();
            } catch (error) {
                parentViewId = errorOf(error);
            }
            const info = (read().mode as unknown as { contextInfo?: unknown }).contextInfo;
            return say('P1 getViewId()', {
                target: target(),
                viewId,
                viewIdType: viewId === null ? 'null' : typeof viewId,
                parentViewId,
                raw: value.raw,
                attributes: (value as unknown as { attributes?: unknown }).attributes ?? null,
                contextInfo: info ?? null,
            });
        },

        async p2() {
            try {
                const all = await read().webAPI.retrieveMultipleRecords(
                    'savedquery',
                    `?$select=savedqueryid,name,isdefault,querytype&$filter=returnedtypecode eq '${target()}' and querytype eq 64`,
                );
                const chosen = await defaultLookupView();
                return say('P2 lookup views', {
                    lookupViews: all.entities.map((e) => ({ id: e.savedqueryid, name: e.name, isdefault: e.isdefault })),
                    defaultLookupView: chosen,
                });
            } catch (error) {
                return say('P2 lookup views', errorOf(error));
            }
        },

        async p3(limit = 100, viewId?: string, parentColumn?: string, parentId?: string) {
            try {
                const { id, name } = await columns();
                let source = 'argument';
                let chosen = viewId ?? '';
                if (!chosen) {
                    const fromField = lookup().getViewId?.();
                    if (fromField) {
                        chosen = fromField;
                        source = 'getViewId()';
                    }
                }
                let xml: string;
                if (chosen) {
                    xml = await viewXml(chosen);
                } else {
                    const fallback = await defaultLookupView();
                    if (!fallback) {
                        return say(`P3 limit ${limit}`, { error: 'no view: getViewId() empty and no default lookup view' });
                    }
                    chosen = fallback.id;
                    source = 'default lookup view';
                    xml = fallback.fetchxml;
                }
                const sent = rewrite(xml, id, name, limit, parentColumn && parentId ? { column: parentColumn, id: parentId } : undefined);
                const started = performance.now();
                const answer = await read().webAPI.retrieveMultipleRecords(target(), `?fetchXml=${sent}`);
                const ms = Math.round(performance.now() - started);
                const extra = answer as unknown as Record<string, unknown>;
                return say(`P3 limit ${limit}${parentId ? ' (P5 parent)' : ''}`, {
                    viewSource: source,
                    viewId: chosen,
                    viewXml: xml,
                    sent,
                    rows: answer.entities.length,
                    truncated: answer.entities.length > limit,
                    nextLink: answer.nextLink ?? null,
                    moreRecords: extra['@Microsoft.Dynamics.CRM.morerecords'] ?? extra.moreRecords ?? null,
                    pagingCookie: extra['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] ?? extra.fetchXmlPagingCookie ?? null,
                    first: answer.entities.slice(0, 12).map((e) => e[name]),
                    ms,
                });
            } catch (error) {
                return say(`P3 limit ${limit}`, errorOf(error));
            }
        },

        async p4() {
            try {
                const { id, name } = await columns();
                const inactive = await read().webAPI.retrieveMultipleRecords(target(), `?$select=${id},${name}&$filter=statecode eq 1`, 10);
                const listed = (await probe.p3(500)) as { first?: unknown[]; rows?: number };
                const all = await read().webAPI.retrieveMultipleRecords(target(), `?$select=${id},${name}&$filter=statecode eq 0`, 500);
                return say('P4 inactive rows', {
                    inactive: inactive.entities.map((e) => e[name]),
                    activeCount: all.entities.length,
                    listedCount: listed.rows ?? null,
                    note: 'listedCount === activeCount (or fewer, if the view filters more) and no inactive name in P3 means the view excluded them',
                });
            } catch (error) {
                return say('P4 inactive rows', errorOf(error));
            }
        },

        async p5(parentColumn = 'parentcustomerid', parentId?: string) {
            const info = (read().mode as unknown as { contextInfo?: { entityId?: string } }).contextInfo;
            const id = (parentId ?? info?.entityId ?? '').replace(/[{}]/g, '').toLowerCase();
            if (!id) {
                return say('P5 parent', { error: 'no parent id: pass one, or run on a saved record' });
            }
            return probe.p3(100, undefined, parentColumn, id);
        },

        async p6() {
            const hundred = (await probe.p3(100)) as { ms?: number; rows?: number };
            const five = (await probe.p3(500)) as { ms?: number; rows?: number };
            return say('P6 timing', { at100: hundred.ms, rows100: hundred.rows, at500: five.ms, rows500: five.rows });
        },

        async all() {
            return {
                p1: probe.p1(),
                p2: await probe.p2(),
                p3: await probe.p3(5),
                p4: await probe.p4(),
                p5: await probe.p5(),
                p6: await probe.p6(),
            };
        },
    };

    (window as unknown as { __lookupSearchProbe: Probe }).__lookupSearchProbe = probe;
}
