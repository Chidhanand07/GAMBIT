import { siteOrigin } from '@/lib/siteUrl';
import { landingStructuredData, serializeJsonLd } from '../structuredData';

/** The landing's JSON-LD (WebSite + SoftwareApplication), escaped for a script element (F-114). */
export function StructuredData() {
    return (
        <script
            type="application/ld+json"
            // The body is our own constant data, serialised with every HTML-significant character escaped.
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(landingStructuredData(siteOrigin())) }}
        />
    );
}
