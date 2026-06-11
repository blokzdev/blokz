import rss from '@astrojs/rss';
import { getArticles } from '@/lib/content-helpers';
import { SITE } from '@/lib/site';

export async function GET(context) {
  const articles = await getArticles();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.pubDate,
      link: `/articles/${article.data.slug}`,
      categories: article.data.topics,
    })),
    customData: '<language>en-us</language>',
  });
}
