export const createCanvas = jest.fn((width, height) => {
    return {
        width,
        height,
        getContext: jest.fn(() => ({
            fillStyle: '',
            font: '',
            textAlign: '',
            fillRect: jest.fn(),
            fillText: jest.fn(),
            drawImage: jest.fn(),
        })),
        toBuffer: jest.fn(() => Buffer.from('fake-image-data')),
    };
});

export const loadImage = jest.fn().mockResolvedValue({
    width: 60,
    height: 60,
});