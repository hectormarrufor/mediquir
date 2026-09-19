'use client';

import '@mantine/carousel/styles.css';
import React, { useRef } from 'react';
import { Carousel } from '@mantine/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { Box, Image } from '@mantine/core';
import classes from './landing.module.css';

// Carrusel de imágenes de producto. Si solo hay una imagen no monta Embla (ahorra recursos en el listado).
export default function ImageCarousel({
    images,
    alt,
    height,
    autoplayDelay = 0,
    withControls = true,
    fit = 'contain',
    padding = 10,
}) {
    const autoplay = useRef(null);
    if (!autoplay.current && autoplayDelay) {
        autoplay.current = Autoplay({ delay: autoplayDelay, stopOnInteraction: true, stopOnMouseEnter: true });
    }

    const renderImage = (img) => (
        <Image src={img.src} alt={alt} fit={fit} h="100%" w="100%" loading="lazy" p={padding} />
    );

    if (images.length <= 1) {
        return <Box h={height}>{renderImage(images[0])}</Box>;
    }

    const stopBubbling = { onClick: (e) => e.stopPropagation() };

    return (
        <Carousel
            loop
            height={height}
            withControls={withControls}
            withIndicators
            controlSize={28}
            plugins={autoplay.current ? [autoplay.current] : []}
            previousControlProps={stopBubbling}
            nextControlProps={stopBubbling}
            classNames={{
                root: classes.carousel,
                controls: classes.controls,
                indicators: classes.indicators,
                indicator: classes.indicator,
            }}
        >
            {images.map((img, i) => (
                <Carousel.Slide key={`${img.src}-${i}`}>{renderImage(img)}</Carousel.Slide>
            ))}
        </Carousel>
    );
}
