import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, ExternalLink, AlertCircle } from 'lucide-react';
import api from '@/utils/api';

const normalizeUrl = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return 'https://' + trimmed;
};

const LiveClassroom = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [meetLink, setMeetLink] = useState('');
  const [phase, setPhase] = useState('loading'); // loading | redirecting | fallback | error
  const [errorMsg, setErrorMsg] = useState('');
  const redirectAttempted = useRef(false);

  useEffect(() => {
    let fallbackTimer;

    const fetchAndRedirect = async () => {
      try {
        const res = await api.get(`/sessions/${sessionId}/join-link`);
        const rawLink = res.data.recitation_link;

        if (!rawLink) {
          setErrorMsg('لم يتم تعيين رابط التسميع لهذا المعلم بعد. يرجى التواصل مع الإدارة.');
          setPhase('error');
          return;
        }

        const link = normalizeUrl(rawLink);
        setMeetLink(link);
        setPhase('redirecting');

        // Attempt redirect after a micro-delay to let React flush the "redirecting" UI
        if (!redirectAttempted.current) {
          redirectAttempted.current = true;
          setTimeout(() => {
            window.open(link, '_self');
          }, 100);
        }

        // Show fallback button after 3 seconds in case redirect is blocked
        fallbackTimer = setTimeout(() => {
          setPhase('fallback');
        }, 3000);

      } catch (err) {
        setErrorMsg('فشل تحميل رابط الجلسة. يرجى المحاولة مرة أخرى.');
        setPhase('error');
      }
    };

    fetchAndRedirect();

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [sessionId]);

  const openMeetLink = () => {
    if (meetLink) {
      window.open(meetLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-12 text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Video className="w-12 h-12 text-primary" />
          </div>

          {phase === 'error' ? (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="font-amiri text-2xl font-bold text-red-600 mb-4">
                {errorMsg}
              </h1>
              <Button
                data-testid="back-btn"
                variant="outline"
                onClick={() => navigate(-1)}
                className="rounded-full mt-4"
              >
                العودة للوحة التحكم
              </Button>
            </>
          ) : phase === 'fallback' ? (
            <>
              <h1 className="font-amiri text-3xl font-bold text-primary mb-4">
                غرفة الدرس جاهزة
              </h1>

              <p className="font-plex text-base text-muted-foreground mb-6">
                اضغط على الزر أدناه للانضمام إلى Google Meet
              </p>

              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-meet-link-btn"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-8 py-4 text-lg font-bold shadow-lg hover:bg-primary/90 transition-colors"
              >
                <ExternalLink size={22} />
                انضم إلى Google Meet
              </a>

              <p className="font-plex text-xs text-muted-foreground mt-4 break-all" dir="ltr">
                {meetLink}
              </p>

              <div className="mt-8 pt-6 border-t">
                <Button
                  data-testid="back-btn"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="rounded-full"
                >
                  العودة للوحة التحكم
                </Button>
              </div>
            </>
          ) : (
            /* loading or redirecting */
            <>
              <h1 className="font-amiri text-3xl font-bold text-primary mb-4">
                {phase === 'loading' ? 'جاري تحميل رابط الدرس...' : 'جاري التحويل إلى Google Meet...'}
              </h1>
              <div className="spinner border-4 border-primary border-t-transparent rounded-full w-10 h-10 mx-auto mb-6"></div>
              <p className="font-plex text-sm text-muted-foreground">
                يرجى الانتظار...
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveClassroom;
