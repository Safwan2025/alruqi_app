import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star, FileText } from 'lucide-react';
import { publicApi } from '@/utils/api';

const ContentDisplay = () => {
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContents();
  }, []);

  const loadContents = async () => {
    try {
      const response = await publicApi.get('/public/content');
      setContents(response.data);
    } catch (error) {
      console.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-10 h-10 mx-auto"></div>
      </div>
    );
  }

  if (contents.length === 0) {
    return null; // Don't show section if no content
  }

  // Separate featured and regular content
  const featuredContent = contents.filter(c => c.is_featured);
  const regularContent = contents.filter(c => !c.is_featured);

  return (
    <div className="w-full max-w-6xl mx-auto" id="content-section">
      {/* Featured Content */}
      {featuredContent.length > 0 && (
        <div className="mb-8 sm:mb-10 space-y-4 sm:space-y-6">
          {featuredContent.map((content) => (
            <Card
              key={content.content_id}
              className="overflow-hidden border-2 border-secondary/50 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-amber-50 to-white"
            >
              <CardContent className="p-0">
                <div className={`flex flex-col ${content.image_url ? 'md:flex-row' : ''}`}>
                  {/* Image — full-bleed, never cropped, never distorted */}
                  {content.image_url && (
                    <div className="md:w-2/5 flex-shrink-0 bg-gradient-to-br from-amber-50 to-amber-100/40 flex items-center justify-center" style={{ minHeight: '12rem' }}>
                      <img
                        src={content.image_url}
                        alt={content.title}
                        loading="lazy"
                        className="w-full max-h-72 md:max-h-[420px] object-contain"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className={`p-4 sm:p-6 md:p-8 flex flex-col justify-center min-w-0 ${content.image_url ? 'md:w-3/5' : 'w-full'}`}>
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Star className="text-secondary fill-secondary flex-shrink-0" size={20} />
                      <span className="font-plex text-xs sm:text-sm text-secondary font-bold">محتوى مميز</span>
                    </div>
                    <h3 className="font-amiri text-xl sm:text-2xl md:text-3xl font-bold text-primary mb-3 sm:mb-4 break-words">
                      {content.title}
                    </h3>
                    <p className="font-plex text-gray-700 leading-relaxed text-sm sm:text-base md:text-lg whitespace-pre-line break-words">
                      {content.content}
                    </p>
                    <p className="font-plex text-xs sm:text-sm text-gray-400 mt-4 sm:mt-6">
                      {new Date(content.created_at).toLocaleDateString('ar-SA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Regular Content Grid */}
      {regularContent.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {regularContent.map((content) => (
            <Card
              key={content.content_id}
              className="overflow-hidden border border-gray-200 hover:border-primary/30 hover:shadow-lg transition-all bg-white group"
            >
              <CardContent className="p-0">
                {/* Image — fit the whole picture, no crop, no distortion */}
                {content.image_url && (
                  <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100/30 flex items-center justify-center" style={{ aspectRatio: '16 / 10' }}>
                    <img
                      src={content.image_url}
                      alt={content.title}
                      loading="lazy"
                      className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="p-4 sm:p-5 min-w-0">
                  <h3 className="font-amiri text-lg sm:text-xl font-bold text-primary mb-2 sm:mb-3 line-clamp-2 break-words">
                    {content.title}
                  </h3>
                  <p className="font-plex text-gray-600 text-xs sm:text-sm leading-relaxed line-clamp-4 whitespace-pre-line break-words">
                    {content.content}
                  </p>
                  <div className="flex items-center justify-between mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
                    <p className="font-plex text-[10px] sm:text-xs text-gray-400">
                      {new Date(content.created_at).toLocaleDateString('ar-SA')}
                    </p>
                    <FileText className="text-gray-300 flex-shrink-0" size={16} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentDisplay;
