const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const dotenv = require("dotenv");

dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

exports.getLearningRecommendations = async (learningTitles) => {
  try {
    const results = await Promise.all(
      learningTitles.map(async (query) => {
        const searchParams = new URLSearchParams({
          part: "snippet",
          q: query,
          maxResults: 1,
          type: "video",
          key: YOUTUBE_API_KEY,
        }).toString();

        const response = await fetch(`${YOUTUBE_SEARCH_URL}?${searchParams}`);
        console.log('유튜브 search url: ', response);
        const data = await response.json();
        console.log('유튜브 결과값: ', data.items);

        if (!data.items || data.items.length === 0) {
          return { title: query, url: null, source: "YouTube" };
        }

        const video = data.items[0];
        return {
          title: query,
          url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
          source: "YouTube",
        };
      })
    );

    return results;
  } catch (error) {
    console.error(error);
    return [];
  }
};
