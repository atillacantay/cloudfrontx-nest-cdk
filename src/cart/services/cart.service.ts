import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartStatus } from '../cart.entity';
import { CartItem } from '../cart-item.entity';
import { PutCartPayload } from 'src/order/type';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
  ) {}

  async findByUserId(userId: string): Promise<Cart | null> {
    return await this.cartRepository.findOne({
      where: { userId, status: CartStatus.OPEN },
      relations: ['items'],
    });
  }

  async createByUserId(userId: string): Promise<Cart> {
    const newCart = this.cartRepository.create({
      userId,
      status: CartStatus.OPEN,
      items: [],
    });

    return await this.cartRepository.save(newCart);
  }

  async findOrCreateByUserId(userId: string): Promise<Cart> {
    let userCart = await this.findByUserId(userId);

    if (!userCart) {
      userCart = await this.createByUserId(userId);
    }

    return userCart;
  }

  async updateByUserId(userId: string, payload: PutCartPayload): Promise<Cart> {
    const userCart = await this.findOrCreateByUserId(userId);

    // Find existing cart item for this product
    const existingItem = userCart.items?.find(
      (item) => item.productId === payload.product.id,
    );

    if (existingItem) {
      if (payload.count === 0) {
        // Remove the item
        await this.cartItemRepository.remove(existingItem);
      } else {
        // Update the count
        existingItem.count = payload.count;
        await this.cartItemRepository.save(existingItem);
      }
    } else if (payload.count > 0) {
      // Create new cart item
      const newCartItem = this.cartItemRepository.create({
        cart: userCart,
        cartId: userCart.id,
        productId: payload.product.id,
        count: payload.count,
      });
      await this.cartItemRepository.save(newCartItem);
    }

    // Return updated cart with items
    return await this.cartRepository.findOne({
      where: { id: userCart.id },
      relations: ['items'],
    });
  }

  async removeByUserId(userId: string): Promise<void> {
    const userCart = await this.findByUserId(userId);
    if (userCart) {
      await this.cartRepository.remove(userCart);
    }
  }
}
