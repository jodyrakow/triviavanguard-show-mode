// src/components/AudioPlayerWithFade.js
import React, { useRef, useEffect, useState } from "react";
import AudioPlayer from "react-h5-audio-player";

/**
 * Audio player wrapper that adds fade-out functionality when pausing
 * @param {number} fadeDuration - Duration of fade out in milliseconds (default: 1000)
 * @param {object} props - All other props passed to react-h5-audio-player
 */
export default function AudioPlayerWithFade({ fadeDuration = 1000, ...props }) {
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Get the audio element from the player
    if (playerRef.current?.audio?.current) {
      audioRef.current = playerRef.current.audio.current;
    }
  }, []);

  const handlePause = () => {
    if (!audioRef.current || isFading) return;

    const audio = audioRef.current;
    const startVolume = audio.volume;
    const steps = 20; // Number of volume reduction steps
    const stepDuration = fadeDuration / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    setIsFading(true);

    fadeIntervalRef.current = setInterval(() => {
      currentStep++;
      const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
      audio.volume = newVolume;

      if (currentStep >= steps) {
        clearInterval(fadeIntervalRef.current);
        audio.pause();
        audio.volume = startVolume; // Restore volume for next play
        setIsFading(false);
      }
    }, stepDuration);
  };

  const handlePlay = () => {
    // If we're fading out, cancel it and restore volume
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      setIsFading(false);
      if (audioRef.current) {
        audioRef.current.volume = 1;
      }
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  return (
    <AudioPlayer
      ref={playerRef}
      onPause={handlePause}
      onPlay={handlePlay}
      {...props}
    />
  );
}
