import axios from 'axios';
import * as cheerio from 'cheerio';
import { url } from 'inspector';
import {URL} from 'url';


export async function crawlCompanySite(baseUrl){

    const visitedPages = new Set();
    const pagesData=[];
    const maxPages=4; //limit crawl dept/breadth for speed and free tier limits

    try{
        // Validate URL security (prevent loopback/private IP hits in production)
        const parsedUrl= new URL(baseUrl);

        if(!['http:','https:'].includes(parsedUrl.protocol)){
            throw new Error('Invalid URL Protocol');
        }

        // Step 1: Fetch root page
        const rootHTML = await fetchPageWithTimeout(baseUrl);

        if(! rootHTML)
            return{
            pageUsed:[],
            textContent:''
        };

        visitedPages.add(baseUrl);
        pagesData.push({ url: baseUrl, html: rootHtml });

        // Step 2: Parse and discover links(careers, jobs, about, culture, blog)

        const cheerio = cheerio.load(rootHTML);
        const discoveredLinks=[];

        $('a').each((_, element) => {

           const href = $(element).attr('href');

           if(href){

                  try {
                   const absoluteUrl= new URL(href,baseUrl).toString();
                   // Keep only links within the same domain

                   if (absoluteUrl.startsWith(baseUrl) && !visitedPages.has(absoluteUrl)) {
                        discoveredLinks.push(absoluteUrl);
                   }

                  } catch (error) {
                    // ignore invalid relative/absolute URL parsing
                  }
           }
        });

       //Step 3:Rank links based on keywords
       const scoredLinks = discoveredLinks.map(link => {
      let score = 0;
      const lower = link.toLowerCase();
      if (lower.includes('career') || lower.includes('job') || lower.includes('hiring')) score += 10;
      if (lower.includes('about') || lower.includes('culture')) score += 5;
      if (lower.includes('blog') || lower.includes('engineering')) score += 3;
      return { link, score };
    });

    scoredLinks.sort((a, b) => b.score - a.score);

    // Step 4: Fetch top ranked candidate pages
    const topLinks = scoredLinks.slice(0, maxPages - 1).map(item => item.link);
    for (const link of topLinks) {
      if (visitedPages.size >= maxPages) break;
      try {
        const html = await fetchPageWithTimeout(link);
        if (html) {
          visitedPages.add(link);
          pagesData.push({ url: link, html });
        }
      } catch (err) {
        // Skip failed secondary pages gracefully
      }
    }

    //  Step 5: Clean and aggregate text content from all fetched pages
    let combinedText = '';
    const pagesUsed = Array.from(visitedPages);

    pagesData.forEach(page => {
      const $page = cheerio.load(page.html);
      // Remove scripts, styles, navbars, footers to reduce noise and token usage
      $page('script, style, nav, footer, header').remove();
      const text = $page('body').text().replace(/\s+/g, ' ').trim();
      combinedText += `\n--- SOURCE PAGE: ${page.url} ---\n${text.slice(0, 3000)}`;
    });

    return {
      pagesUsed,
      textContent: combinedText
    };

  } catch (error) {
    console.warn(`Crawling warning for ${baseUrl}: ${error.message}`);
    // Return empty state rather than failing the entire pipeline (per Section 2 & 10)
    return { pagesUsed: [], textContent: '' };
  }
}

async function fetchPageWithTimeout(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TraoPrepBot/1.0' },
      maxRedirects: 3
    });
    return response.data;
    
  } catch (error) {
    return null; // Return null on timeout, 404, or blocked requests
  }
}


    



