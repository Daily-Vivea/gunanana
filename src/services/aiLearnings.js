import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

export const getLearningRecommendations = async (learningTitles) => {
  try {
    const results = await Promise.all(
      learningTitles.map(async (query) => {
        const searchParams = new URLSearchParams({
          part: "snippet",
          q: query,
          maxResults: 1,
          type: "video",
          key: YOUTUBE_API_KEY,
        });

        const response = await fetch(`${YOUTUBE_SEARCH_URL}?${searchParams}`);
        const data = await response.json();

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
