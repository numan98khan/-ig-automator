import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type SeoProps = {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  robots?: string;
  type?: 'website' | 'article';
  structuredData?: Record<string, unknown>;
};

const DEFAULT_DESCRIPTION =
  'SendFx automates multi-channel DMs with AI guardrails, approvals, and smart routing.';
const DEFAULT_IMAGE = '/sendfx.png';
const SITE_NAME = 'SendFx';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_SITE_URL as string | undefined;
  const baseUrl = envUrl || window.location.origin;
  return baseUrl.replace(/\/$/, '');
};

const resolveUrl = (baseUrl: string, pathOrUrl: string) => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
};

const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
  const selector = `meta[${attr}="${key}"]`;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
};

const upsertLink = (rel: string, href: string) => {
  const selector = `link[rel="${rel}"]`;
  let element = document.head.querySelector(selector) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const Seo = ({
  title,
  description,
  canonicalPath,
  image = DEFAULT_IMAGE,
  robots = 'index, follow',
  type = 'website',
  structuredData,
}: SeoProps) => {
  const location = useLocation();

  useEffect(() => {
    const baseUrl = getBaseUrl();
    const descriptionContent = description || DEFAULT_DESCRIPTION;
    const canonicalUrl = canonicalPath
      ? `${baseUrl}${canonicalPath.startsWith('/') ? '' : '/'}${canonicalPath}`
      : `${baseUrl}${location.pathname}`;
    const imageUrl = resolveUrl(baseUrl, image);

    document.title = title;

    upsertMeta('name', 'description', descriptionContent);
    upsertMeta('name', 'robots', robots);

    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', descriptionContent);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:site_name', SITE_NAME);

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', descriptionContent);
    upsertMeta('name', 'twitter:image', imageUrl);

    upsertLink('canonical', canonicalUrl);

    const scriptId = 'seo-jsonld';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (structuredData) {
      const script = existingScript || document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(structuredData);
      if (!existingScript) {
        document.head.appendChild(script);
      }
    } else if (existingScript) {
      existingScript.remove();
    }
  }, [
    title,
    description,
    canonicalPath,
    image,
    robots,
    type,
    structuredData,
    location.pathname,
  ]);

  return null;
};

export default Seo;
